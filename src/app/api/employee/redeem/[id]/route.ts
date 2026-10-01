import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getEmployeeFromSession,
  unauthorized,
  internalError,
  companyInactive,
  notFound,
  badRequest,
} from '@/lib/employee-session'
import { deriveStatus } from '@/lib/redemption-status'
import { validateSaving } from '@/lib/redemption-savings-validation'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const employee = await getEmployeeFromSession()
    if (!employee) return unauthorized()
    if ('inactive' in employee) return companyInactive(employee.companyStatus)

    const { id } = await params
    const body = await request.json()
    const { billAmount, loggedSavingAmount, quantityPurchased } = body ?? {}

    const bill = Number(billAmount)
    const saving = Number(loggedSavingAmount)
    if (!Number.isFinite(bill) || bill < 0) {
      return badRequest('billAmount must be a non-negative number')
    }
    if (!Number.isFinite(saving) || saving < 0 || saving > bill) {
      return badRequest('loggedSavingAmount must be a non-negative number and cannot exceed billAmount')
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

    const redemption = await prisma.redemption.findFirst({
      where: { id, employeeId: employee.id },
      select: {
        id: true,
        isVerified: true,
        verifiedAt: true,
        merchantNotes: true,
        employeeNotes: true,
        savingLoggedAt: true,
        offer: {
          select: {
            pricing: { select: { pricingType: true, configuration: true } },
          },
        },
      },
    })
    if (!redemption) return notFound('Redemption not found')

    if (deriveStatus(redemption) !== 'CONFIRMED') {
      return badRequest(
        'Bill and savings can only be logged for confirmed redemptions',
      )
    }

    // Simple, synchronous check — no background job, no alert, no audit log.
    const validation = validateSaving(
      redemption.offer.pricing?.pricingType,
      redemption.offer.pricing?.configuration as Record<string, unknown> | undefined,
      bill,
      saving,
      quantityPurchased ?? undefined,
    )

    const now = new Date()
    const updated = await prisma.redemption.update({
      where: { id },
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
      data: {
        id: updated.id,
        billAmount: updated.billAmount,
        loggedSavingAmount: updated.loggedSavingAmount,
        quantityPurchased: updated.quantityPurchased,
        savingMethod: updated.savingMethod,
        savingLoggedAt: updated.savingLoggedAt,
        savingEditedAt: updated.savingEditedAt,
        // Frontend uses these two to decide what to render:
        //   VALID           -> hide form, show "Valid" message, no edit button
        //   INVALID         -> show validation message + Edit button
        //   NOT_VERIFIABLE  -> treat like VALID (accepted, can't be checked)
        validationStatus: updated.savingValidationStatus,
        validationMessage: updated.savingValidationMessage,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}