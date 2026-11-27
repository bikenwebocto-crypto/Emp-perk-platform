import { notEndedBy } from '@/lib/offers/end-date';
import { prisma } from '@/lib/prisma';
import { BaseRepository } from './base.repository';
import type { Prisma, Merchant } from '@prisma/client';
import type { MerchantStatus, MerchantOnboardingStep } from '@/types';

type MerchantCreateInput = Prisma.MerchantCreateInput;
type MerchantUpdateInput = Prisma.MerchantUpdateInput;

export class MerchantRepository extends BaseRepository<Merchant, MerchantCreateInput, MerchantUpdateInput> {
  constructor() {
    super('merchant');
  }

  async findByEmail(email: string): Promise<Merchant | null> {
    const account = await prisma.account.findUnique({
      where: { email },
      select: { authUserId: true },
    })
    if (!account) return null
    return prisma.merchant.findFirst({ where: { accountId: account.authUserId } });
  }

  async findBySlug(slug: string): Promise<Merchant | null> {
    return prisma.merchant.findUnique({ where: { slug } });
  }

  async findByStatus(
    status: MerchantStatus,
    page = 1,
    pageSize = 20
  ) {
    return this.findManyPaginated({
      where: { status: status as any },
      orderBy: { createdAt: 'desc' },
      page,
      pageSize,
      include: {
        category: true,
        _count: { select: { offers: true, branches: true } },
      },
    });
  }

  async findByCategory(
    categoryId: string,
    status: MerchantStatus = 'ACTIVE' as MerchantStatus
  ): Promise<Merchant[]> {
    return prisma.merchant.findMany({
      where: { categoryId, status: status as any, deletedAt: null },
      orderBy: { isFeatured: 'desc' },
      include: {
        branches: { where: { isActive: true } },
        offers: {
          where: { status: 'LIVE' as any, AND: [notEndedBy(new Date(), true)] },
          take: 1,
        },
      },
    });
  }

  async updateStatus(
    id: string,
    status: MerchantStatus,
    rejectionReason?: string,
    changedBy?: string,
    changedByType?: string
  ): Promise<Merchant> {
    const result = await prisma.merchant.update({
      where: { id },
      data: {
        status: status as any,
        rejectionReason,
        approvedAt: status === 'ACTIVE' ? new Date() : undefined,
      },
    });

    // Create status history entry
    await prisma.merchantStatusHistory.create({
      data: {
        merchantId: id,
        toStatus: status as any,
        changedBy: changedBy ?? 'system',
        changedByType: changedByType ?? 'system',
        reason: rejectionReason,
      },
    });

    return result;
  }

  async search(query: string, status?: MerchantStatus, page = 1, pageSize = 20) {
    return this.findManyPaginated({
      where: {
        ...(status ? { status: status as any } : {}),
        deletedAt: null,
        OR: [
          { businessName: { contains: query, mode: 'insensitive' } },
          { contactName: { contains: query, mode: 'insensitive' } },
          { city: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      page,
      pageSize,
      include: {
        category: true,
        _count: { select: { offers: true, branches: true, redemptions: true } },
      },
    });
  }

  async getDashboardStats(merchantId: string, dateFrom: Date, dateTo: Date) {
    const [totalRedemptions, totalOffers, activeOffers, recentRedemptions] =
      await Promise.all([
        prisma.redemption.count({
          where: { merchantId, redeemedAt: { gte: dateFrom, lte: dateTo } },
        }),
        prisma.merchantOffer.count({ where: { merchantId, deletedAt: null } }),
        prisma.merchantOffer.count({
          where: { merchantId, deletedAt: null, status: 'LIVE', AND: [notEndedBy(new Date(), true)] },
        }),
        prisma.redemption.findMany({
          where: { merchantId, redeemedAt: { gte: dateFrom, lte: dateTo } },
          orderBy: { redeemedAt: 'desc' },
          take: 10,
          include: {
            offer: { select: { title: true } },
            employee: { select: { firstName: true, lastName: true } },
          },
        }),
      ]);

    return { totalRedemptions, totalOffers, activeOffers, recentRedemptions };
  }
}

export const merchantRepository = new MerchantRepository();
