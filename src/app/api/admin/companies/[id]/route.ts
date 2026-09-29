import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/supabase/server';
import { getCityReadiness } from '@/lib/company-activation/city-readiness';
import { sendLaunchPack, sendBillingReminder } from '@/lib/company-activation/launch-pack';
import { derivePrimaryAdmin, ensurePrimaryAdmin, summarizeAdmins } from '@/lib/company-contact';
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service';
import { forbidden } from '@/lib/api-auth';
import { BUSINESS_NOTIFICATION_TEMPLATES, channels, publishBusinessToCompanyAdmins } from '@/services/business-notification.service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    console.log('Company detail request by user:', user?.id, user?.email, user?.userType, user?.role);
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

    // Auto-fix primary admin: if the company has admins but none flagged
    // isPrimary, promote the oldest ACTIVE admin (per spec). Safe to run
    // on every read — it's a no-op when the invariant is already met.
    try {
      await ensurePrimaryAdmin(id)
    } catch (err) {
      console.error('ensurePrimaryAdmin failed for company', id, err)
    }

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        billing: true,
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { company: { select: { name: true } } },
        },
        _count: { select: { employees: true, redemptions: true, csvUploads: true } },
        companyAdmins: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          include: { account: { select: { email: true, status: true } } },
        },
      },
    });

    if (!company || company.deletedAt) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 },
      );
    }

 // Email lives on the linked account; fill it in after summarizing
const emailByAdminId = new Map(
  company.companyAdmins.map((a) => [a.id, a.account?.email ?? '']),
)

const admins = summarizeAdmins(company.companyAdmins).map((a) => ({
  ...a,
  email: a.email || emailByAdminId.get(a.id) || '',
}))

const derived = derivePrimaryAdmin(company.companyAdmins)
const primaryAdmin = derived
  ? { ...derived, email: derived.email || emailByAdminId.get(derived.id) || '' }
  : null
    const activeAdminCount = admins.filter((a) => a.isActive).length

    const data = {
      ...company,
      companyContact: {
        id: company.id,
        companyName: company.name,
        companyEmail: company.email,
        phone: company.phone,
        website: company.website,
        status: company.status,
        city: company.city,
        country: company.country,
        industry: company.industry,
        logoUrl: company.logoUrl,
        employeeCount: company._count?.employees ?? 0,
        createdAt: company.createdAt,
      },
      primaryAdmin,
      admins,
      adminCount: admins.length,
      activeAdminCount,
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

    const { id } = await params;
    const body = await request.json();

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company || company.deletedAt) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 },
      );
    }

    if (body.status) {
      const previousStatus = company.status;
      const validStatuses = ['PENDING', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'CANCELLED', 'APPROVED_PENDING_PAYMENT'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION', message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` } },
          { status: 400 },
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

      await prisma.company.update({
        where: { id },
        data: {
          status: body.status,
          adminNote: body.adminNote ?? company.adminNote,
          approvedAt: body.status === 'ACTIVE' && !company.approvedAt ? new Date() : undefined,
        },
      });

      await prisma.companyStatusHistory.create({
        data: {
          companyId: id,
          fromStatus: previousStatus,
          toStatus: body.status,
          changedBy: user.id,
          changedByType: 'admin',
          reason: body.reason,
        },
      });

      await createAuditLog(fromCurrentUser(user, `COMPANY_${body.status}`, 'company', id, {
        changes: { from: previousStatus, to: body.status, reason: body.reason },
      }));

      // When activation succeeds, dispatch the launch pack to the
      // company admin + active employees.
      if (body.status === 'ACTIVE' && previousStatus !== 'ACTIVE') {
        try {
          if (user.profileId) await sendLaunchPack(id, user.profileId)
        } catch (err) {
          console.error('Launch pack failed for company', id, err)
        }
      }

      if (body.status === 'ACTIVE' || body.status === 'SUSPENDED') {
        const template = body.status === 'ACTIVE'
          ? BUSINESS_NOTIFICATION_TEMPLATES.companyApproved(company.name)
          : {
              type: 'COMPANY_DISABLED' as const,
              title: `Company access suspended: ${company.name}`,
              message: 'Your company account has been suspended. Contact support for details.',
              priority: 'HIGH' as const,
            };
        await publishBusinessToCompanyAdmins(id, {
          ...template,
          channels: channels('IN_APP', 'PUSH', 'EMAIL'),
          referenceType: 'company',
          referenceId: id,
          metadata: { previousStatus, status: body.status, reason: body.reason ?? null },
        });
      }
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
      await prisma.companyBilling.update({
        where: { companyId: id },
        data: { billingStatus: body.billingStatus as any },
      });

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

    return NextResponse.json({ success: true, data, message: 'Company updated successfully' });
  } catch (error) {
    console.error('Company update error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
