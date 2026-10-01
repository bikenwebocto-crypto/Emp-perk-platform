import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMerchantFromSession } from '@/lib/merchant-session'
import { emailService } from '@/lib/email/email'
import { createAuditLog } from '@/services/audit-log.service'
import {
  renderRedemptionSuccessEmployeeTemplate,
  renderRedemptionSuccessMerchantTemplate,
} from '@/emails/templates'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}

function forbidden(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'MERCHANT_ACCESS_DENIED', message } },
    { status: 403 }
  )
}

function conflict(code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status: 409 }
  )
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'BAD_REQUEST', message } },
    { status: 400 }
  )
}

function internalError(error: unknown) {
  console.error('Redemption redeem API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

function formatDate(date: Date): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export async function POST(request: NextRequest) {
  try {
    const merchant = await getMerchantFromSession()
    if (!merchant) return unauthorized()

    const body = await request.json()
    const { code } = body

    if (!code || typeof code !== 'string' || !code.trim()) {
      return badRequest('Redemption code is required')
    }

    const trimmedCode = code.trim().toUpperCase()

    // Lookup scoped to this merchant's own redemptions directly in the
    // query — codes are unique per redemption, and the scoping ensures a
    // code can never match another merchant's record even in theory.
    // (The post-fetch ownership check below is kept as defense-in-depth.)
    const redemption = await prisma.redemption.findFirst({
      where: { redemptionCode: trimmedCode, merchantId: merchant.id },
      include: {
        offer: {
          include: {
            merchant: {
              select: { id: true, businessName: true, accountId: true },
            },
            redemption: { select: { redemptionType: true } },
          },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true, accountId: true },
        },
        company: {
          select: { id: true, name: true },
        },
        merchant: {
          select: { id: true, businessName: true, accountId: true },
        },
      },
    })

    if (!redemption) {
      return badRequest('Redemption code not found')
    }

    const [empAccount, merchantAccount] = await Promise.all([
      redemption.employee.accountId
        ? prisma.account.findUnique({ where: { authUserId: redemption.employee.accountId }, select: { email: true } })
        : null,
      redemption.offer.merchant.accountId
        ? prisma.account.findUnique({ where: { authUserId: redemption.offer.merchant.accountId }, select: { email: true } })
        : null,
    ])
    const empEmail = empAccount?.email
    const merchEmail = merchantAccount?.email

    // IN_STORE_QR redemptions are auto-confirmed at employee redemption
    // time (the code is a receipt/proof-of-redemption, not a state
    // transition trigger). Return a read-only success response — no
    // state change, no emails, no audit log.
    if (
      redemption.offer.redemption?.redemptionType === 'IN_STORE_QR' &&
      redemption.isVerified &&
      redemption.verifiedAt
    ) {
      return NextResponse.json({
        success: true,
        alreadyConfirmed: true,
        message: 'This in-store redemption was already confirmed at the time of employee redemption.',
        redemption: {
          id: redemption.id,
          code: redemption.redemptionCode,
          isVerified: true,
          verifiedAt: redemption.verifiedAt.toISOString(),
          employeeName: `${redemption.employee.firstName} ${redemption.employee.lastName}`,
          companyName: redemption.company.name,
          offerTitle: redemption.offer.title,
          merchantName: redemption.offer.merchant.businessName,
        },
      })
    }

    if (redemption.isVerified && redemption.verifiedAt) {
      return conflict('ALREADY_REDEEMED', 'This redemption has already been processed')
    }

    if (!redemption.offer) {
      return conflict('OFFER_REFERENCE_MISSING', 'The redemption exists but its associated offer record is unavailable')
    }

    // Merchant ownership validation — MUST be offer.merchantId, not redemption.merchantId
    if (redemption.offer.merchantId !== merchant.id) {
      return forbidden('You are not authorized to redeem this offer.')
    }

    const now = new Date()
    if (redemption.offer.endDate < now) {
      return conflict('VOUCHER_EXPIRED', 'This redemption code has expired')
    }

    await prisma.redemption.update({
      where: { id: redemption.id },
      data: {
        isVerified: true,
        verifiedBy: merchant.id,
        verifiedAt: now,
      },
    })

    await createAuditLog({
      actorType: 'merchant',
      actorId: merchant.id,
      action: 'REDEMPTION_REDEEMED',
      entityType: 'REDEMPTION',
      entityId: redemption.id,
      metadata: {
        redemptionCode: redemption.redemptionCode ?? '',
        offerId: redemption.offerId,
        employeeId: redemption.employeeId,
        companyId: redemption.companyId,
        merchantId: merchant.id,
        redeemedAt: now.toISOString(),
      },
    })

    const redeemedDate = formatDate(now)

    const employeeHtml = renderRedemptionSuccessEmployeeTemplate({
      employeeFirstName: redemption.employee.firstName,
      offerTitle: redemption.offer.title,
      merchantName: redemption.offer.merchant.businessName,
      redemptionCode: redemption.redemptionCode ?? '',
      redeemedDate,
    })

    const merchantHtml = renderRedemptionSuccessMerchantTemplate({
      merchantName: merchant.businessName,
      employeeName: `${redemption.employee.firstName} ${redemption.employee.lastName}`,
      companyName: redemption.company.name,
      offerTitle: redemption.offer.title,
      redemptionCode: redemption.redemptionCode ?? '',
      redeemedDate,
    })

    const emailPromises: Promise<unknown>[] = []

    if (empEmail) {
      emailPromises.push(
        emailService.sendEmail({
          to: empEmail,
          subject: 'Your Reward Has Been Redeemed',
          html: employeeHtml,
        }).catch((err) => {
          console.error('Failed to send employee redemption email:', err)
        })
      )
    }

    if (merchEmail) {
      emailPromises.push(
        emailService.sendEmail({
          to: merchEmail,
          subject: 'Reward Redemption Completed',
          html: merchantHtml,
        }).catch((err) => {
          console.error('Failed to send merchant redemption email:', err)
        })
      )
    }

    if (redemption.employee.id) {
      emailPromises.push(
        prisma.notificationEvent.create({
          data: {
            recipientType: 'EMPLOYEE',
            employeeId: redemption.employee.id,
            title: 'Your Reward Has Been Redeemed',
            body: `Your reward "${redemption.offer.title}" has been successfully redeemed at ${redemption.offer.merchant.businessName}.`,
            channel: 'IN_APP',
            priority: 'NORMAL',
            referenceType: 'REDEMPTION',
            referenceId: redemption.id,
          },
        }).catch((err) => {
          console.error('Failed to create employee notification:', err)
        })
      )
    }

    await Promise.allSettled(emailPromises)

    return NextResponse.json({
      success: true,
      redemption: {
        id: redemption.id,
        code: redemption.redemptionCode,
        isVerified: true,
        verifiedAt: now.toISOString(),
        employeeName: `${redemption.employee.firstName} ${redemption.employee.lastName}`,
        employeeEmail: empEmail ?? '',
        companyName: redemption.company.name,
        offerTitle: redemption.offer.title,
        merchantName: redemption.offer.merchant.businessName,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
