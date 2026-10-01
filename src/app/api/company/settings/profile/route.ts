import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCompanyAdmin, handleApiError } from '../../helpers'

// GET /api/company/settings/profile
// Returns the logged-in company admin's own company profile + billing.
// Uses the permissive guard so a PAUSED/SUSPENDED company can still READ
// its status (to see "why"), while PATCH keeps the strict guard.
export async function GET() {
  try {
    const { company } = await getCompanyAdmin({ allowInactive: true })

    const billing = await prisma.companyBilling.findUnique({
      where: { companyId: company.id },
      select: {
        plan: true,
        billingStatus: true,
        renewalDate: true,
        isTrial: true,
        trialEndsAt: true,
      },
    })

    return NextResponse.json({ success: true, data: { ...company, billing } })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { company, companyAdmin } = await getCompanyAdmin()
    const body = await request.json()
    const {
      name, phone, website, addressLine1, addressLine2, city, state,
      postalCode, country, industry, approvedDomain, taxId, logoUrl,
    } = body

    const updatable: any = {}
    if (name !== undefined) updatable.name = name
    if (phone !== undefined) updatable.phone = phone
    if (website !== undefined) updatable.website = website
    if (addressLine1 !== undefined) updatable.addressLine1 = addressLine1
    if (addressLine2 !== undefined) updatable.addressLine2 = addressLine2
    if (city !== undefined) updatable.city = city
    if (state !== undefined) updatable.state = state
    if (postalCode !== undefined) updatable.postalCode = postalCode
    if (country !== undefined) updatable.country = country
    if (industry !== undefined) updatable.industry = industry
    if (approvedDomain !== undefined) updatable.approvedDomain = approvedDomain
    if (taxId !== undefined) updatable.taxId = taxId
    if (logoUrl !== undefined) updatable.logoUrl = logoUrl

    if (Object.keys(updatable).length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'No fields to update' } },
        { status: 400 },
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.company.update({
        where: { id: company.id },
        data: updatable,
      })

      await tx.auditLog.create({
        data: {
          actorType: 'COMPANY_ADMIN',
          companyId: company.id,
          action: 'PROFILE_UPDATED',
          entityType: 'COMPANY',
          entityId: company.id,
          changes: updatable,
          metadata: { updatedBy: companyAdmin.id },
        },
      })

      return result
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    return handleApiError(error)
  }
}