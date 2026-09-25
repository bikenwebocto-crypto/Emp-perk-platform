import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { internalError } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { deriveStatus } from '@/lib/redemption-status'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') ?? '20')),
    )

    const where = { employeeId: auth.employee.id }

    const [rows, total, merchantGroups, totals] = await Promise.all([
      prisma.redemption.findMany({
        where,
        orderBy: { redeemedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          redemptionCode: true,
          discountAmount: true,
          savingsAmount: true,
          billAmount: true,
          loggedSavingAmount: true,
          quantityPurchased: true,
          isRedeemed: true,
          rejectionReason: true,
          // Savings form / validation fields
          savingLoggedAt: true,
          savingEditedAt: true,
          savingValidationStatus: true,
          savingValidationMessage: true,

          isVerified: true,
          verifiedAt: true,
          redeemedAt: true,
          merchantNotes: true,
          employeeNotes: true,

          offer: {
            select: {
              id: true,
              title: true,
              offerType: true,
              content: {
                select: {
                  imageUrls: true,
                },
              },
            },
          },

          merchant: {
            select: {
              id: true,
              businessName: true,
              logoUrl: true,
            },
          },
        },
      }),
      prisma.redemption.count({ where }),
      // Distinct merchants this employee has redeemed from
      prisma.redemption.groupBy({
        by: ['merchantId'],
        where,
      }),
      // Total amounts across ALL redemptions (not just current page)
      prisma.redemption.aggregate({
        where,
        _sum: {
          savingsAmount: true,
          discountAmount: true,
        },
      }),
    ])

    const items = rows.map((r) => ({
      id: r.id,
      redeemedAt: r.redeemedAt,
      // Original redemption/saving values
      savingsAmount: r.savingsAmount,
      discountAmount: r.discountAmount,
      billAmount: r.billAmount,
      loggedSavingAmount: r.loggedSavingAmount,
      quantityPurchased: r.quantityPurchased,

      // Savings form state
      savingLoggedAt: r.savingLoggedAt,
      savingEditedAt: r.savingEditedAt,
      savingValidationStatus: r.savingValidationStatus,
      savingValidationMessage: r.savingValidationMessage,

      redemptionCode: r.redemptionCode,
      isRedeemed: r.isRedeemed,
      rejectionReason: r.rejectionReason,
      isVerified: r.isVerified,
      status: deriveStatus(r),

      offer: {
        id: r.offer.id,
        title: r.offer.title,
        offerType: r.offer.offerType,
        imageUrl:
          (r.offer.content?.imageUrls as string[] | null)?.[0] ?? null,
      },

      merchant: r.merchant,
    }))

    return NextResponse.json({
      success: true,
      data: items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        merchantsRedeemedCount: merchantGroups.length,
        totalSavingsAmount: Number(totals._sum.savingsAmount ?? 0),
        totalDiscountAmount: Number(totals._sum.discountAmount ?? 0),
      },
    })
  } catch (error) {
    return internalError(error)
  }
}