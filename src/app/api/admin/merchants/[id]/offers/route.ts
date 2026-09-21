import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const merchant = await prisma.merchant.findUnique({
      where: { id },
    })

    if (!merchant || merchant.deletedAt) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Merchant not found',
          },
        },
        { status: 404 },
      )
    }

    const offers = await prisma.merchantOffer.findMany({
      where: {
        merchantId: id,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        title: true,
        status: true,
        offerType: true,
        startDate: true,
        endDate: true,

        _count: {
          select: {
            redemptions: true,
          },
        },

        replacesOffer: {
          select: {
            id: true,
            title: true,
          },
        },

        pricing: {
          select: {
            configuration: true,
          },
        },

        capacity: {
          select: {
            redeemedCount: true,
            maxRedemptions: true,
          },
        },

        content: {
          select: {
            imageUrls: true,
          },
        },

        review: {
          select: {
            reviewNotes: true,
            rejectionReason: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: offers,
      meta: {
        total: offers.length,
      },
    })
  } catch (error) {
    console.error('Merchant offers error:', error)

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL',
          message: 'Internal server error',
        },
      },
      { status: 500 },
    )
  }
}

