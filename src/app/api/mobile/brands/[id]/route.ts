import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { internalError, notFound } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { isEvergreenRange, offerRank } from '@/lib/offers/evergreen'

// GET /api/mobile/brands/[id]
//
// Brand detail for the mobile app: merchant profile, active branches,
// and currently-live offers. Returns 404 if the merchant is not active
// or has been soft-deleted.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response
    const { id } = await params
    if (!id) return notFound('Brand not found')

    const now = new Date()
    const merchant = await prisma.merchant.findFirst({
      where: {
        id,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        category: { select: { id: true, name: true, icon: true } },
        branches: {
          where: { deletedAt: null, status: 'ACTIVE' },
          orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
        },
        offers: {
          where: {
            status: 'LIVE',
            startDate: { lte: now },
            endDate: { gt: now },
          },
          orderBy: [ {isFlash: 'desc'},{ isFeatured: 'desc' }, { createdAt: 'desc' }],
          take: 50,
          select: {
            id: true,
            title: true,
            offerType: true,
            startDate: true,
            endDate: true,
            isFlash: true,
            isFeatured: true,
            isExclusive: true,
            content: { select: { shortDescription: true, imageUrls: true } },
            pricing: { select: { configuration: true } },
          },
        },
        _count: { select: { offers: true, branches: true } },
      },
    })
    if (!merchant) return notFound('Brand not found')

    const offers = [...(merchant.offers ?? [])]
      .map((offer) => ({
        ...offer,
        evergreen: isEvergreenRange(offer.startDate, offer.endDate),
      }))
      .sort((a, b) => {
        const aRank = offerRank({ evergreen: a.evergreen, isFlash: a.isFlash })
        const bRank = offerRank({ evergreen: b.evergreen, isFlash: b.isFlash })
        return aRank - bRank
      })

    return NextResponse.json({ success: true, data: { ...merchant, offers } })
  } catch (error) {
    return internalError(error)
  }
}
