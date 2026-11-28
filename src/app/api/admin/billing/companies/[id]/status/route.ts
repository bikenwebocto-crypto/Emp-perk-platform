import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  requireAdmin,
  writeBillingAudit,
  writeBillingNotification,
  isValidBillingTransition,
  BILLING_AUDIT_ACTIONS,
} from '@/lib/billing/auth-helpers'

/**
 * PATCH /api/admin/billing/companies/[id]/status
 *
 * Body: { status: 'ACTIVE' | 'INVOICE_OVERDUE' | 'ON_HOLD', reason?: string }
 *
 * Enforces allowed transitions, writes an audit log entry, creates a
 * notification event, and records the previous status in CompanyStatusHistory.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  if (!auth.profileId) {
    return NextResponse.json(
      { success: false, error: { code: 'NO_ADMIN_PROFILE', message: 'Admin profile not found' } },
      { status: 403 },
    )
  }

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    status?: string
    reason?: string
  }
  const targetStatus = body.status
  const reason = (body.reason ?? '').trim()

  const VALID = ['ACTIVE', 'INVOICE_OVERDUE', 'ON_HOLD']
  if (!targetStatus || !VALID.includes(targetStatus)) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'VALIDATION', message: 'status must be ACTIVE, INVOICE_OVERDUE, or ON_HOLD' },
      },
      { status: 400 },
    )
  }

  try {
    const billing = await prisma.companyBilling.findUnique({
      where: { companyId: id },
      include: { company: { select: { name: true, status: true, deletedAt: true } } },
    })
    if (!billing || billing.company.deletedAt) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Company billing record not found' } },
        { status: 404 },
      )
    }

    if (billing.billingStatus === targetStatus) {
      return NextResponse.json(
        { success: false, error: { code: 'NOOP', message: 'Status is already set to that value' } },
        { status: 400 },
      )
    }

    if (!isValidBillingTransition(billing.billingStatus, targetStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_TRANSITION',
            message: `Cannot transition billing status from ${billing.billingStatus} to ${targetStatus}`,
          },
        },
        { status: 400 },
      )
    }

    const fromStatus = billing.billingStatus
    const profileId = auth.profileId

    await prisma.$transaction(async (tx) => {
      await tx.companyBilling.update({
        where: { companyId: id },
        data: { billingStatus: targetStatus as any },
      })
      await tx.companyStatusHistory.create({
        data: {
          companyId: id,
          fromStatus: billing.company.status as any,
          toStatus: billing.company.status as any,
          changedBy: profileId,
          changedByType: 'admin',
          reason: `Billing status: ${fromStatus} → ${targetStatus}${reason ? ` (${reason})` : ''}`,
        },
      })
      await writeBillingAudit({
        action: BILLING_AUDIT_ACTIONS.STATUS_CHANGED,
        companyId: id,
        profileId,
        fromStatus,
        toStatus: targetStatus,
        reason: reason || undefined,
        tx,
      })
    })

    await writeBillingNotification({
      companyId: id,
      adminId: profileId,
      title: `Billing status changed: ${billing.company.name}`,
      body: `Status transitioned from ${fromStatus} to ${targetStatus}.`,
      referenceType: 'company_billing',
      referenceId: id,
      priority: targetStatus === 'ACTIVE' ? 'NORMAL' : 'HIGH',
    }).catch((err) =>
      console.error('Billing status notification failed', err),
    )

    return NextResponse.json({
      success: true,
      message: `Billing status changed to ${targetStatus}`,
      data: { fromStatus, toStatus: targetStatus },
    })
  } catch (err) {
    console.error('Billing status update error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
