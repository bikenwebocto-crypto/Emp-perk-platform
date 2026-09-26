import { NextResponse } from 'next/server';
import { startOfMonth, subMonths } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/supabase/server';

const TIME_ZONE = 'Europe/Nicosia';

// Offer statuses that mean "waiting for an admin decision".
const PENDING_OFFER_STATUSES = ['AWAITING_APPROVAL', 'PENDING_APPROVAL', 'VALIDATION_IN_PROGRESS'];

const round1 = (n) => Math.round(n * 10) / 10;

/** Start of the current and previous calendar month in Cyprus time, as UTC instants. */
function nicosiaMonthBoundaries(now) {
  const localMonthStart = startOfMonth(toZonedTime(now, TIME_ZONE));
  return {
    monthStart: fromZonedTime(localMonthStart, TIME_ZONE),
    prevMonthStart: fromZonedTime(subMonths(localMonthStart, 1), TIME_ZONE),
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const { monthStart, prevMonthStart } = nicosiaMonthBoundaries(now);
    const activeEmployeeWhere = { status: 'ACTIVE', deletedAt: null };

    // Every count runs in this single batch — no per-row follow-up queries.
    const [
      totalRedemptions,
      currentPeriodRedemptions,
      prevPeriodRedemptions,
      currentPeriodDiscount,
      prevPeriodDiscount,
      currentPeriodSavings,
      prevPeriodSavings,
      activeMerchants,
      activeCompanies,
      activeOffers,
      pendingActions,
      pendingApprovals,
      recentActivity,
      allTimeAgg,
      liveOffers,
      pendingOffers,
      totalEmployees,
      newEmployeesThisMonth,
      activeEmployeeGroups,
      redemptionsThisMonth,
      redemptionsLastMonth,
      pausedMerchants,
    ] = await Promise.all([
      prisma.redemption.count(),
      prisma.redemption.count({ where: { redeemedAt: { gte: thirtyDaysAgo } } }),
      prisma.redemption.count({
        where: { redeemedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),
      prisma.redemption.aggregate({
        where: { redeemedAt: { gte: thirtyDaysAgo } },
        _sum: { discountAmount: true },
      }),
      prisma.redemption.aggregate({
        where: { redeemedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
        _sum: { discountAmount: true },
      }),
      prisma.redemption.aggregate({
        where: { redeemedAt: { gte: thirtyDaysAgo } },
        _sum: { savingsAmount: true },
      }),
      prisma.redemption.aggregate({
        where: { redeemedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
        _sum: { savingsAmount: true },
      }),
      prisma.merchant.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.company.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.merchantOffer.count({ where: { status: 'LIVE' } }),
      prisma.actionQueueItem.count({ where: { status: 'PENDING' } }),
      prisma.actionQueueItem.findMany({
        where: { status: 'PENDING' },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 10,
        include: { merchant: { select: { id: true, businessName: true, slug: true } } },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          admin: { select: { id: true, firstName: true, lastName: true } },
          merchant: { select: { id: true, businessName: true } },
          company: { select: { id: true, name: true } },
        },
      }),
      // All-time totals from redeemed rows. The redemption_analytics rollup
      // is only filled by a cron job that is not scheduled, so it is empty.
      prisma.redemption.aggregate({
        where: { redeemedAt: { not: null } },
        _sum: { discountAmount: true, savingsAmount: true },
        _count: { _all: true },
      }),
      prisma.merchantOffer.count({
        where: { status: 'LIVE', deletedAt: null, endDate: { gt: now } },
      }),
      prisma.merchantOffer.count({
        where: { status: { in: PENDING_OFFER_STATUSES }, deletedAt: null },
      }),
      prisma.employee.count({ where: activeEmployeeWhere }),
      // Same ACTIVE filter as totalEmployees so "+X this month" never exceeds the total.
      prisma.employee.count({ where: { ...activeEmployeeWhere, createdAt: { gte: monthStart } } }),
      // Distinct active employees with ≥1 redemption in the last 30 days;
      // _count gives their redemption totals without another query.
      prisma.redemption.groupBy({
        by: ['employeeId'],
        where: { redeemedAt: { gte: thirtyDaysAgo }, employee: activeEmployeeWhere },
        _count: { _all: true },
      }),
      prisma.redemption.count({ where: { redeemedAt: { gte: monthStart } } }),
      prisma.redemption.count({ where: { redeemedAt: { gte: prevMonthStart, lt: monthStart } } }),
      prisma.merchant.count({ where: { status: 'PAUSED', deletedAt: null } }),
    ]);

    const currentDiscount = currentPeriodDiscount._sum.discountAmount
      ? Number(currentPeriodDiscount._sum.discountAmount) : 0;
    const prevDiscount = prevPeriodDiscount._sum.discountAmount
      ? Number(prevPeriodDiscount._sum.discountAmount) : 0;
    const currentSavings = currentPeriodSavings._sum.savingsAmount
      ? Number(currentPeriodSavings._sum.savingsAmount) : 0;
    const prevSavings = prevPeriodSavings._sum.savingsAmount
      ? Number(prevPeriodSavings._sum.savingsAmount) : 0;

    const calcChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const totalSavings = Number(allTimeAgg._sum.savingsAmount ?? 0);
    const redeemedCount = allTimeAgg._count._all;
    const activeEmployees = activeEmployeeGroups.length;
    const activeEmployeeRedemptions = activeEmployeeGroups.reduce((sum, g) => sum + g._count._all, 0);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalRedemptions,
          totalDiscount: Number(allTimeAgg._sum.discountAmount ?? 0),
          totalSavings,
          activeMerchants,
          activeCompanies,
          activeOffers,
          pendingActions,
          liveOffers,
          pendingOffers,
          totalEmployees,
          newEmployeesThisMonth,
          activeEmployees,
          engagementRate: totalEmployees > 0 ? round1((activeEmployees / totalEmployees) * 100) : null,
          redemptionsThisMonth,
          redemptionsTrend: redemptionsLastMonth > 0
            ? round1(((redemptionsThisMonth - redemptionsLastMonth) / redemptionsLastMonth) * 100)
            : null,
          avgSavingsPerRedemption: redeemedCount > 0 ? Math.round((totalSavings / redeemedCount) * 100) / 100 : null,
          avgRedemptionsPerActiveEmployee: activeEmployees > 0
            ? round1(activeEmployeeRedemptions / activeEmployees)
            : null,
          pausedMerchants,
          periodComparison: {
            redemptionsChange: calcChange(currentPeriodRedemptions, prevPeriodRedemptions),
            discountChange: calcChange(currentDiscount, prevDiscount),
            savingsChange: calcChange(currentSavings, prevSavings),
          },
        },
        pendingApprovals: pendingApprovals.map((item) => ({
          id: item.id, type: item.type, title: item.title, description: item.description,
          referenceId: item.referenceId, referenceType: item.referenceType, priority: item.priority,
          merchantName: item.merchant?.businessName ?? null, createdAt: item.createdAt,
        })),
        recentActivity: recentActivity.map((log) => ({
          id: log.id, action: log.action, entityType: log.entityType, entityId: log.entityId,
          actorName: log.admin ? `${log.admin.firstName} ${log.admin.lastName}`
            : log.merchant ? log.merchant.businessName
            : log.company ? log.company.name : 'System',
          actorType: log.actorType, createdAt: log.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}