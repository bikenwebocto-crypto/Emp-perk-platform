import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { internalError } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { validateSaving } from '@/lib/redemption-savings-validation'
import { deriveStatus } from '@/lib/redemption-status'

function badRequest(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: { code: 'VALIDATION', message },
    },
    { status: 400 },
  )
}

function notFound(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: { code: 'NOT_FOUND', message },
    },
    { status: 404 },
  )
}

function forbidden(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: { code: 'FORBIDDEN', message },
    },
    { status: 403 },
  )
}

export async function PATCH(request: NextRequest) {
  try {
    console.log(' ** # ** PATCH /api/mobile/profile/saving request received.',request)
    // Authenticate mobile employee.
    // getAuthenticatedMobileEmployee returns a result object:
    //   { ok: true, employee, company, account, user } | { ok: false, response }
    // It is NEVER null — the ok flag must be checked, and the employee
    // record lives at auth.employee.
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const body = await request.json()
    console.log(' ** # ** PATCH /api/mobile/profile/saving body:', body)
    const {
      redemptionId,
      billAmount,
      loggedSavingAmount,
      quantityPurchased,
    } = body ?? {}

    if (!redemptionId || typeof redemptionId !== 'string') {
      return badRequest('Redemption ID is required.')
    }

    const bill = Number(billAmount)
    const saving = Number(loggedSavingAmount)

    if (!Number.isFinite(bill) || bill <= 0) {
      return badRequest('Invalid bill amount.')
    }

    if (!Number.isFinite(saving) || saving < 0) {
      return badRequest('Invalid saving amount.')
    }

    if (saving > bill) {
      return badRequest('Saving amount cannot be greater than the bill amount.')
    }

    // Optional — only meaningful for buy_x_get_y offers (BOGO savings math
    // needs the actual units bought). Irrelevant for percentage/flat.
    if (
      quantityPurchased !== undefined &&
      quantityPurchased !== null &&
      (!Number.isInteger(quantityPurchased) || quantityPurchased <= 0)
    ) {
      return badRequest('quantityPurchased must be a positive whole number')
    }

    console.log(` ** # ** Employee ${auth.employee.id} is updating redemption ${redemptionId} with bill ${bill} and saving ${saving}.`,
    )
    const redemption = await prisma.redemption.findUnique({
      where: {
        id: redemptionId,
      },
      include: {
        offer: {
          include: {
            pricing: true,
          },
        },
      },
    })

    if (!redemption) {
      return notFound('Redemption not found.')
    }

    // Make sure the redemption belongs to the authenticated employee.
    if (redemption.employeeId !== auth.employee.id) {
      return forbidden('You are not allowed to update this redemption.')
    }

    // Savings can only be entered after the merchant has approved the
    // redemption (project status: CONFIRMED). Reject PENDING / REJECTED /
    // CANCELLED so the entry cannot bypass merchant approval.
    const currentStatus = deriveStatus(redemption)
    if (currentStatus !== 'CONFIRMED') {
      return badRequest(
        `Savings can only be entered for an approved redemption. This redemption is currently ${currentStatus}.`,
      )
    }

    // Reuse the existing saving validation logic.
    const validation = validateSaving(
      redemption.offer.pricing?.pricingType,
      redemption.offer.pricing?.configuration as
        | Record<string, unknown>
        | undefined,
      bill,
      saving,
      quantityPurchased ?? undefined,
    )

    const now = new Date()

    const updated = await prisma.redemption.update({
      where: {
        id: redemptionId,
      },
      data: {
        billAmount: bill,
        loggedSavingAmount: saving,
        quantityPurchased: quantityPurchased ?? null,
        savingMethod: 'MANUAL',
        savingLoggedAt: redemption.savingLoggedAt ?? now,
        savingEditedAt: redemption.savingLoggedAt ? now : null,
        savingValidationStatus: validation.status,
        savingValidationMessage: validation.message,
      },
    })

    return NextResponse.json({
      success: true,
      saving: {
        redemptionId: updated.id,
        billAmount: updated.billAmount,
        loggedSavingAmount: updated.loggedSavingAmount,
        quantityPurchased: updated.quantityPurchased,
        validation: {
          status: validation.status,
          message: validation.message,
        },
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
