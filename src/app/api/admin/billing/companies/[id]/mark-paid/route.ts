import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  requireAdmin,
  writeBillingAudit,
  writeBillingNotification,
  BILLING_AUDIT_ACTIONS,
} from '@/lib/billing/auth-helpers'
import { peakKey } from '@/lib/billing/peak-headcount'

/**
 * POST /api/admin/billing/companies/[id]/mark-paid
 *
 * Records that payment for the upcoming renewal was confirmed externally
 * (QuickBooks is the source of truth). This:
 *   1. Resets the peak 30-day headcount (= clears PlatformSettings key)
 *   2. Advances the renewal date by 1 year
 *   3. Creates an audit log
 *   4. Creates a notification event
 *
 * Per the task spec we do NOT change any monetary values.
 */
export async function POST(
  _request: NextRequest,
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

  try {
    const billing = await prisma.companyBilling.findUnique({
      where: { companyId: id },
      include: { company: { select: { id: true, name: true, deletedAt: true } } },
    })
    if (!billing || billing.company.deletedAt) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Company billing record not found' } },
        { status: 404 },
      )
    }

    const profileId = auth.profileId

    // Advance renewal date by 1 year. If no date is set, default to today + 1y.
    const baseDate = billing.renewalDate ?? new Date()
    const nextRenewal = new Date(baseDate)
    nextRenewal.setFullYear(nextRenewal.getFullYear() + 1)

    await prisma.$transaction(async (tx) => {
      await tx.companyBilling.update({
        where: { companyId: id },
        data: { renewalDate: nextRenewal },
      })
      // deleteMany makes a missing peak setting a no-op, matching clearPeak().
      await tx.platformSettings.deleteMany({ where: { key: peakKey(id) } })

      await writeBillingAudit({
        action: BILLING_AUDIT_ACTIONS.PEAK_RESET,
        companyId: id,
        profileId,
        reason: 'Renewal paid — peak headcount reset',
        metadata: {
          previousRenewalDate: billing.renewalDate?.toISOString() ?? null,
          nextRenewalDate: nextRenewal.toISOString(),
        },
        tx,
      })

      await writeBillingAudit({
        action: BILLING_AUDIT_ACTIONS.PAID_CONFIRMED,
        companyId: id,
        profileId,
        reason: 'Renewal payment confirmed (QuickBooks source of truth)',
        metadata: {
          nextRenewalDate: nextRenewal.toISOString(),
        },
        tx,
      })
    })

    await writeBillingNotification({
      companyId: id,
      adminId: profileId,
      title: `Renewal paid: ${billing.company.name}`,
      body: `Payment confirmed in QuickBooks. Peak headcount reset, renewal advanced to ${nextRenewal.toLocaleDateString()}.`,
      referenceType: 'company_billing',
      referenceId: id,
      priority: 'NORMAL',
    }).catch((err) =>
      console.error('Renewal paid notification failed', err),
    )

    return NextResponse.json({
      success: true,
      message: 'Renewal marked paid',
      data: { nextRenewalDate: nextRenewal.toISOString() },
    })
  } catch (err) {
    console.error('Mark paid error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
