import { notEndedBy } from '@/lib/offers/end-date';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom')
      ? new Date(searchParams.get('dateFrom')!)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = searchParams.get('dateTo')
      ? new Date(searchParams.get('dateTo')!)
      : new Date();

    let merchantFilter = {};
    let companyFilter = {};

    if (user.userType === 'merchant') {
      merchantFilter = { merchantId: user.id };
    } else if (user.userType === 'company_admin') {
      companyFilter = { companyId: user.companyId };
    }

    const [
      redemptionStats,
      periodComparison,
      activeMerchants,
      activeCompanies,
      pendingActions,
    ] = await Promise.all([
      prisma.redemption.aggregate({
        where: {
          redeemedAt: { gte: dateFrom, lte: dateTo },
          ...merchantFilter,
          ...companyFilter,
        },
        _count: true,
        _sum: { discountAmount: true, savingsAmount: true },
      }),

      // Previous period comparison
      prisma.redemption.aggregate({
        where: {
          redeemedAt: {
            gte: new Date(dateFrom.getTime() - (dateTo.getTime() - dateFrom.getTime())),
            lte: dateFrom,
          },
          ...merchantFilter,
          ...companyFilter,
        },
        _count: true,
        _sum: { discountAmount: true, savingsAmount: true },
      }),

      prisma.merchant.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.company.count({ where: { status: 'ACTIVE' } }),
      prisma.actionQueueItem.count({ where: { status: 'PENDING' } }),
    ]);

    const currentCount = redemptionStats._count;
    const previousCount = periodComparison._count;

    return NextResponse.json({
      success: true,
      data: {
        totalRedemptions: currentCount,
        totalDiscount: Number(redemptionStats._sum.discountAmount ?? 0),
        totalSavings: Number(redemptionStats._sum.savingsAmount ?? 0),
        activeMerchants,
        activeCompanies,
        activeOffers: await prisma.merchantOffer.count({
          where: {
            status: 'LIVE',
            AND: [notEndedBy(new Date(), true)],
            startDate: { lte: new Date() },
          },
        }),
        pendingActions,
        periodComparison: {
          redemptionsChange: previousCount > 0
            ? ((currentCount - previousCount) / previousCount) * 100
            : 0,
          discountChange: 0,
          savingsChange: 0,
        },
      },
    });
  } catch (error) {
    console.error('Analytics summary error:', error);
    return NextResponse.json({ success: false, error: { code: 'INTERNAL', message: 'Internal server error' } }, { status: 500 });
  }
}
