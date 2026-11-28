import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { formatDateDMY } from '@/lib/format'
import { getCompanyAdmin, handleApiError } from '../helpers'

export async function GET() {
  try {
    const { company } = await getCompanyAdmin()

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [employeeStats, redemptionsThisMonth, billing] = await Promise.all([
      prisma.employee.aggregate({
        where: { companyId: company.id, deletedAt: null },
        _count: { id: true },
        _max: { createdAt: true },
      }),
      prisma.redemption.count({
        where: {
          companyId: company.id,
          redeemedAt: { gte: startOfMonth, lt: startOfNextMonth },
        },
      }),
      prisma.companyBilling.findUnique({ where: { companyId: company.id } }),
    ])

    const enrolledEmployees = employeeStats._count.id

    const activeThisMonth = await prisma.employee.count({
      where: {
        companyId: company.id,
        status: 'ACTIVE',
        deletedAt: null,
      },
    })

    const activationRate = enrolledEmployees > 0
      ? Math.round((activeThisMonth / enrolledEmployees) * 100)
      : 0

    const alerts: { type: string; message: string; severity: 'info' | 'warning' | 'error' }[] = []

    if (enrolledEmployees === 0) {
      alerts.push({ type: 'NO_EMPLOYEES', message: 'No employees enrolled yet. Invite your first employee to get started.', severity: 'info' })
    }

    if (billing) {
      if (billing.renewalDate) {
        const daysToRenewal = Math.ceil((billing.renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (daysToRenewal <= 30 && daysToRenewal > 0) {
          alerts.push({ type: 'RENEWAL_DUE', message: `Renewal due in ${daysToRenewal} days (${formatDateDMY(billing.renewalDate)})`, severity: 'warning' })
        }
      }
      if (billing.billingStatus === 'INVOICE_OVERDUE') {
        alerts.push({ type: 'INVOICE_OVERDUE', message: 'Your invoice is overdue. Please pay to avoid service interruption.', severity: 'error' })
      }
      if (billing.billingStatus === 'ON_HOLD') {
        alerts.push({ type: 'ACCOUNT_ON_HOLD', message: 'Your account is on hold due to billing issues.', severity: 'error' })
      }
    }

    if (enrolledEmployees > 0 && activeThisMonth > 0) {
      const redemptionsPerEmployee = redemptionsThisMonth / activeThisMonth
      if (redemptionsPerEmployee < 0.5) {
        alerts.push({ type: 'LOW_ENGAGEMENT', message: 'Employee engagement is low this month. Consider promoting available offers.', severity: 'warning' })
      }
    }

    const estimatedRenewalAmount = billing
      ? Number(billing.pricePerEmployee) * activeThisMonth
      : 0

    return NextResponse.json({
      success: true,
      data: {
        enrolledEmployees,
        activeThisMonth,
        activationRate,
        redemptionsThisMonth,
        totalSavings: 0,
        nextBillingDate: billing?.nextBillingDate ?? billing?.renewalDate ?? null,
        estimatedRenewalAmount,
        plan: billing?.plan ?? 'Trial',
        billingStatus: billing?.billingStatus ?? 'ACTIVE',
        alerts,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
