import { notEndedBy } from '@/lib/offers/end-date';
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEmployeeFromSession, unauthorized, internalError, companyInactive, notFound, badRequest } from '@/lib/employee-session'

export async function GET(_request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession()
    if (!employee) return unauthorized()
    if ('inactive' in employee) return companyInactive(employee.companyStatus)

    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - 7)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [allTime, today, thisWeek, thisMonth, totalSavings, savedCount, totalLiveOffers] = await Promise.all([
      prisma.redemption.count({ where: { employeeId: employee.id } }),
      prisma.redemption.count({ where: { employeeId: employee.id, redeemedAt: { gte: startOfDay } } }),
      prisma.redemption.count({ where: { employeeId: employee.id, redeemedAt: { gte: startOfWeek } } }),
      prisma.redemption.count({ where: { employeeId: employee.id, redeemedAt: { gte: startOfMonth } } }),
      prisma.redemption.aggregate({
        where: { employeeId: employee.id },
        _sum: { savingsAmount: true },
      }),
      prisma.notificationEvent.count({
        where: {
          employeeId: employee.id,
          referenceType: 'saved_offer',
        },
      }),
      prisma.merchantOffer.count({
        where: {
          status: 'LIVE',
          startDate: { lte: now },
          AND: [notEndedBy(now)],
          merchant: {
            status: 'ACTIVE',
            deletedAt: null,
            branches: { some: { isActive: true, status: 'ACTIVE', deletedAt: null } },
          },
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        redemptions: {
          allTime,
          today,
          thisWeek,
          thisMonth,
        },
        totalSavings: Number(totalSavings._sum.savingsAmount ?? 0),
        savedOffers: savedCount,
        activeOffers: totalLiveOffers,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
