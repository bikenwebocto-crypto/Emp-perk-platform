import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCompanyAdmin, handleApiError } from '../helpers'

export async function GET() {
  try {
    const { company } = await getCompanyAdmin()

    const billing = await prisma.companyBilling.findUnique({
      where: { companyId: company.id },
    })

    const activeEmployees = await prisma.employee.count({
      where: { companyId: company.id, status: 'ACTIVE', deletedAt: null },
    })

    const data = {
      plan: billing?.plan ?? 'Trial',
      billingEmail: billing?.billingEmail ?? company.email,
      billingCycle: billing?.billingCycle ?? 'monthly',
      pricePerEmployee: billing ? Number(billing.pricePerEmployee) : 5,
      currency: billing?.currency ?? 'EUR',
      nextBillingDate: billing?.nextBillingDate ?? null,
      renewalDate: billing?.renewalDate ?? null,
      billingStatus: billing?.billingStatus ?? 'ACTIVE',
      isTrial: billing?.isTrial ?? true,
      trialEndsAt: billing?.trialEndsAt ?? null,
      totalPaid: billing ? Number(billing.totalPaid) : 0,
      invoiceCount: billing?.invoiceCount ?? 0,
      paymentMethodLast4: billing?.paymentMethodLast4 ?? null,
      activeEmployees,
      includedEmployees: company.employeeCount || 0,
      estimatedMonthlyCost: billing ? Number(billing.pricePerEmployee) * activeEmployees : 0,
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleApiError(error)
  }
}
