import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/supabase/server';
import { getCityReadiness } from '@/lib/company-activation/city-readiness';
import { sendLaunchPack, sendBillingReminder } from '@/lib/company-activation/launch-pack';
import { derivePrimaryAdmin, ensurePrimaryAdmin, summarizeAdmins } from '@/lib/company-contact';
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service';
import { forbidden } from '@/lib/api-auth';
import { writeBillingAudit, BILLING_AUDIT_ACTIONS } from '@/lib/billing/auth-helpers';
import { getCompanyDetail } from '@/lib/company-detail/service';
import { collectEmailWarnings, notifyCompanyStatusChange } from '@/services/business-notification.service';
import { signOutAuthUsers } from "@/app/api/admin/accounts/helpers";
import { canActivatePendingCompany } from '@/lib/access/company-access';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 },
      );
    }
    if (user.userType !== 'admin') {
      return forbidden(user.userType);
    }

    const { id } = await params;
    const data = await getCompanyDetail(id, 'super_admin');
    if (!data) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Company detail error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 },
      );
    }
    if (!user.profileId) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_ADMIN_PROFILE', message: 'Admin profile not found' } },
        { status: 403 },
      );
    }
    const adminId = user.profileId;

    const { id } = await params;
    const body = await request.json();

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company || company.deletedAt) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 },
      );
    }

    if (body.status === 'APPROVED_PENDING_PAYMENT' && company.status !== 'PENDING') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_TRANSITION', message: 'Only a pending company can be approved for payment.' } },
        { status: 409 },
      );
    }

    if (body.status === 'ACTIVE' && company.status === 'PENDING') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_TRANSITION', message: 'Approve the company and confirm payment before activation.' } },
        { status: 409 },
      );
    }

    if (
      body.status === 'ACTIVE' &&
      !canActivatePendingCompany(company.status, user.adminRole)
    ) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Only a Super Admin can activate a pending company.' } },
        { status: 403 },
      );
    }

    const emailWarnings: string[] = [];

    if (body.status) {
      const previousStatus = company.status;
      const validStatuses = ['PENDING', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'CANCELLED', 'APPROVED_PENDING_PAYMENT'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION', message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` } },
          { status: 400 },
        );
      }

      // No-op transitions would write duplicate status history / audit
      // rows and re-send notifications (e.g. "company approved" again).
      if (body.status === previousStatus) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION', message: `Company is already ${previousStatus}` } },
          { status: 409 },
        );
      }

      // City Readiness Gate: cannot transition to ACTIVE unless the
      // headquarters city meets the merchant/category thresholds.
      if (body.status === 'ACTIVE') {
        const readiness = await getCityReadiness(company.city)
        if (!readiness.ready) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'CITY_NOT_READY',
                message: readiness.message,
                details: readiness,
              },
            },
            { status: 422 }
          )
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id },
          data: {
            status: body.status,
            adminNote: body.adminNote ?? company.adminNote,
            approvedAt: body.status === 'ACTIVE' && !company.approvedAt ? new Date() : undefined,
          },
        });

        await tx.companyStatusHistory.create({
          data: {
            companyId: id,
            fromStatus: previousStatus,
            toStatus: body.status,
            changedBy: adminId,
            changedByType: 'admin',
            reason: body.reason,
          },
        });

        await createAuditLog(fromCurrentUser(user, `COMPANY_${body.status}`, 'company', id, {
          changes: { from: previousStatus, to: body.status, reason: body.reason },
        }), tx);

        if (
          body.status === 'APPROVED_PENDING_PAYMENT' ||
          body.status === 'ACTIVE' ||
          body.status === 'CANCELLED'
        ) {
          await tx.actionQueueItem.updateMany({
            where: { referenceId: id, referenceType: 'company', status: 'PENDING' },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
        }
      });

      // When activation succeeds, dispatch the launch pack to the
      // company admin + active employees.
      // Launch pack (welcome + sign-in email) only on the first activation.
      const firstActivation = body.status === 'ACTIVE' && previousStatus !== 'ACTIVE' && !company.approvedAt
      if (firstActivation) {
        try {
          if (user.profileId) {
            const pack = await sendLaunchPack(id, user.profileId)
            if (pack.emailWarning) emailWarnings.push(pack.emailWarning)
          }
        } catch (err) {
          console.error('Launch pack failed for company', id, err)
          emailWarnings.push('The welcome (launch pack) email could not be sent. Check the server logs.')
        }
      }

      // ON-07: end employee sessions when the company is paused or suspended.
      if (body.status === "PAUSED" || body.status === "SUSPENDED") {
        const employees = await prisma.employee.findMany({ where: { companyId: id, accountId: { not: null } }, select: { accountId: true } });
        await signOutAuthUsers(employees.map((e) => e.accountId!).filter(Boolean));
      }
      emailWarnings.push(...collectEmailWarnings(await notifyCompanyStatusChange({
        companyId: id,
        companyName: company.name,
        previousStatus,
        status: body.status,
        reason: body.reason ?? null,
        firstActivation,
      })))
    }

    if (body.adminNote !== undefined) {
      await prisma.company.update({
        where: { id },
        data: { adminNote: body.adminNote.substring(0, 500) },
      });
    }

    if (body.billingStatus) {
      const validBillingStatuses = ['ACTIVE', 'INVOICE_OVERDUE', 'ON_HOLD'];
      if (!validBillingStatuses.includes(body.billingStatus)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION', message: `Invalid billing status. Must be one of: ${validBillingStatuses.join(', ')}` } },
          { status: 400 },
        );
      }

      const previousBilling = await prisma.companyBilling.findUnique({ where: { companyId: id } })
      const nextBillingStatus = body.billingStatus as string
      if (previousBilling?.billingStatus !== nextBillingStatus) {
        await prisma.$transaction(async (tx) => {
          await tx.companyBilling.update({
            where: { companyId: id },
            data: { billingStatus: nextBillingStatus as any },
          });
          await writeBillingAudit({
            action: BILLING_AUDIT_ACTIONS.STATUS_CHANGED,
            companyId: id,
            profileId: user.profileId,
            fromStatus: previousBilling?.billingStatus ?? undefined,
            toStatus: nextBillingStatus,
            metadata: { source: 'admin_company_patch' },
            tx,
          });
        });
      }

      // Non-payment cascade: when a company moves to INVOICE_OVERDUE,
      // send a reminder to the company admin(s) via the existing
      // NotificationEvent / queue pipeline.
      if (
        body.billingStatus === 'INVOICE_OVERDUE' &&
        previousBilling?.billingStatus !== 'INVOICE_OVERDUE'
      ) {
        try {
          if (user.profileId) await sendBillingReminder(id, user.profileId)
        } catch (err) {
          console.error('Billing reminder failed for company', id, err)
        }
      }
    }

    const updated = await prisma.company.findUnique({
      where: { id },
      include: {
        billing: true,
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 10 },
        _count: { select: { employees: true, redemptions: true, csvUploads: true } },
        companyAdmins: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    const updatedAdmins = summarizeAdmins(updated?.companyAdmins ?? [])
    const updatedPrimary = derivePrimaryAdmin(updated?.companyAdmins ?? [])

    const data = updated
      ? {
          ...updated,
          companyContact: {
            id: updated.id,
            companyName: updated.name,
            companyEmail: updated.email,
            phone: updated.phone,
            website: updated.website,
            socialLinks: updated.socialLinks,
            status: updated.status,
            city: updated.city,
            country: updated.country,
            industry: updated.industry,
            logoUrl: updated.logoUrl,
            employeeCount: updated._count?.employees ?? 0,
            createdAt: updated.createdAt,
          },
          primaryAdmin: updatedPrimary,
          admins: updatedAdmins,
          adminCount: updatedAdmins.length,
          activeAdminCount: updatedAdmins.filter((a) => a.isActive).length,
        }
      : null

    return NextResponse.json({ success: true, data, message: 'Company updated successfully', emailWarnings });
  } catch (error) {
    console.error('Company update error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
