import { notEndedBy } from '@/lib/offers/end-date';
import { prisma } from '@/lib/prisma';
import { BaseRepository } from './base.repository';
import type { Prisma, MerchantOffer } from '@prisma/client';
import type { OfferStatus } from '@/types';

type OfferCreateInput = Prisma.MerchantOfferCreateInput;
type OfferUpdateInput = Prisma.MerchantOfferUpdateInput;

export class OfferRepository extends BaseRepository<MerchantOffer, OfferCreateInput, OfferUpdateInput> {
  constructor() {
    super('merchantOffer');
  }

  async findByMerchant(merchantId: string, status?: OfferStatus) {
    return this.findMany({
      where: {
        merchantId,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        merchant: {
          select: { id: true, businessName: true, slug: true, logoUrl: true },
        },
      },
    });
  }

  async findLiveOffers(companyId: string, page = 1, pageSize = 20) {
    const now = new Date();
    return this.findManyPaginated({
      where: {
        status: 'LIVE' as any,
        startDate: { lte: now },
        AND: [notEndedBy(now, true)],
        merchant: {
          status: 'ACTIVE' as any,
          deletedAt: null,
          category: { companyId },
        },
      },
      orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      page,
      pageSize,
      include: {
        merchant: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
            state: true,
            averageRating: true,
            categoryId: true,
          },
        },
      },
    });
  }

  async updateStatus(
    id: string,
    status: OfferStatus,
    rejectionReason?: string,
    reviewedBy?: string
  ): Promise<MerchantOffer> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.merchantOffer.update({
        where: { id },
        data: {
          status: status as any,
          reviewedAt: new Date(),
          liveAt: status === 'LIVE' ? new Date() : undefined,
        },
      });

      await tx.offerReview.upsert({
        where: { offerId: id },
        create: {
          offerId: id,
          reviewedBy: reviewedBy ?? null,
          reviewedAt: new Date(),
          rejectionReason: rejectionReason ?? null,
        },
        update: {
          reviewedBy: reviewedBy ?? null,
          reviewedAt: new Date(),
          rejectionReason: rejectionReason ?? null,
        },
      });

      return updated;
    });
  }

  async getMerchantActiveOffer(merchantId: string): Promise<MerchantOffer | null> {
    const now = new Date();
    return prisma.merchantOffer.findFirst({
      where: {
        merchantId,
        deletedAt: null,
        status: 'LIVE' as any,
        startDate: { lte: now },
        AND: [notEndedBy(now, true)],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getExpiringOffers(daysThreshold = 7): Promise<MerchantOffer[]> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysThreshold);

    return prisma.merchantOffer.findMany({
      where: {
        deletedAt: null,
        status: 'LIVE' as any,
        endDate: { lte: threshold, gte: new Date() },
      },
      include: {
        merchant: { select: { id: true, businessName: true } },
      },
    });
  }

  async getOfferAnalytics(offerId: string) {
    const [redemptions, uniqueEmployees] = await Promise.all([
      prisma.redemption.findMany({
        where: { offerId },
        orderBy: { redeemedAt: 'desc' },
      }),
      prisma.redemption.groupBy({
        by: ['employeeId'],
        where: { offerId },
      }),
    ]);

    return {
      totalRedemptions: redemptions.length,
      uniqueEmployees: uniqueEmployees.length,
      totalDiscount: redemptions.reduce((sum, r) => sum + Number(r.discountAmount), 0),
      totalSavings: redemptions.reduce((sum, r) => sum + Number(r.savingsAmount), 0),
      redemptions,
    };
  }
}

export const offerRepository = new OfferRepository();
