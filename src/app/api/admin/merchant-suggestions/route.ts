import { NextRequest, NextResponse } from 'next/server'
import type { MerchantSuggestionStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { badRequest, internalError } from '@/lib/employee-helpers'
import {
  MERCHANT_SUGGESTION_STATUSES,
  isMerchantSuggestionStatus,
  parsePagination,
  requireAdmin,
} from '@/lib/merchant-suggestions'

// GET /api/admin/merchant-suggestions
//
// Query: status, q (merchant name/email/phone, employee name, company name),
// page, pageSize (max 100).
// meta.counts holds per-status totals for the current search (ignoring the
// status filter) so the stage bar can show them alongside the list.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const { page, pageSize, skip } = parsePagination(searchParams, 100)
    const rawStatus = searchParams.get('status')
    const q = searchParams.get('q')?.trim()

    if (rawStatus && rawStatus !== 'ALL' && !isMerchantSuggestionStatus(rawStatus)) {
      return badRequest('Invalid status filter')
    }
    const status = isMerchantSuggestionStatus(rawStatus) ? rawStatus : null

    const searchWhere: Prisma.MerchantSuggestionWhereInput = q
      ? {
          OR: [
            { merchantName: { contains: q, mode: 'insensitive' } },
            { merchantEmail: { contains: q, mode: 'insensitive' } },
            { merchantPhone: { contains: q } },
            { employee: { firstName: { contains: q, mode: 'insensitive' } } },
            { employee: { lastName: { contains: q, mode: 'insensitive' } } },
            { company: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}

    const where: Prisma.MerchantSuggestionWhereInput = status
      ? { ...searchWhere, status }
      : searchWhere

    const [rows, total, grouped] = await Promise.all([
      prisma.merchantSuggestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
          company: { select: { id: true, name: true } },
          merchant: { select: { id: true, businessName: true } },
        },
      }),
      prisma.merchantSuggestion.count({ where }),
      prisma.merchantSuggestion.groupBy({
        by: ['status'],
        where: searchWhere,
        _count: { _all: true },
      }),
    ])

    const counts = Object.fromEntries(
      MERCHANT_SUGGESTION_STATUSES.map((s) => [s, 0]),
    ) as Record<MerchantSuggestionStatus, number>
    for (const g of grouped) counts[g.status] = g._count._all

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        counts,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
