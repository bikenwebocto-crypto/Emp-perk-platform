import { NextRequest, NextResponse } from 'next/server'
import type { MerchantSuggestion } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { badRequest, internalError } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { createAuditLog } from '@/services/audit-log.service'
import {
  OPEN_SUGGESTION_STATUSES,
  SUGGESTION_RATE_LIMIT,
  SUGGESTION_RATE_WINDOW_MS,
  apiError,
  isMerchantSuggestionStatus,
  parsePagination,
  validateMerchantSuggestionInput,
  readRequestBody,
} from '@/lib/merchant-suggestions'

// Fields an employee may see on their own suggestions. adminNotes,
// rejectionReason and reviewer identity are internal and never returned.
const EMPLOYEE_SELECT = {
  id: true,
  merchantName: true,
  merchantWebsite: true,
  merchantPhone: true,
  merchantEmail: true,
  reason: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const

type EmployeeSuggestion = Pick<MerchantSuggestion, keyof typeof EMPLOYEE_SELECT>

// Explicit whitelist (not a spread) so internal fields can never leak even
// if a query is later changed to return the full row.
function serialize(s: EmployeeSuggestion) {
  return {
    id: s.id,
    merchantName: s.merchantName,
    merchantWebsite: s.merchantWebsite,
    merchantPhone: s.merchantPhone,
    merchantEmail: s.merchantEmail,
    reason: s.reason,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

// POST /api/mobile/merchant-suggestions
//
// File a merchant suggestion for the authenticated employee.
//   merchantName, merchantPhone, merchantEmail (required),
//   merchantWebsite, reason (optional)
//
// employeeId / companyId are NEVER read from the client — both come from
// the Supabase Bearer token via getAuthenticatedMobileEmployee.
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response
    const { employee } = auth

    const body = await readRequestBody(request)
    if (!body) {
      return badRequest('Send the form as form-data or a JSON body')
    }

    const validation = validateMerchantSuggestionInput(body)
    if (!validation.ok) return badRequest('Invalid merchant suggestion', validation.errors)
    const input = validation.data

    // The rate-limit and duplicate checks run under a per-employee advisory
    // lock so two concurrent submissions cannot both slip past them.
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`merchant_suggestion:${employee.id}`}))`

      const recentCount = await tx.merchantSuggestion.count({
        where: {
          employeeId: employee.id,
          createdAt: { gte: new Date(Date.now() - SUGGESTION_RATE_WINDOW_MS) },
        },
      })
      if (recentCount >= SUGGESTION_RATE_LIMIT) return { kind: 'rate_limited' as const }

      const duplicate = await tx.merchantSuggestion.findFirst({
        where: {
          employeeId: employee.id,
          status: { in: OPEN_SUGGESTION_STATUSES },
          OR: [{ merchantEmail: input.merchantEmail }, { merchantPhone: input.merchantPhone }],
        },
        select: { id: true },
      })
      if (duplicate) return { kind: 'duplicate' as const, id: duplicate.id }

      const created = await tx.merchantSuggestion.create({
        data: {
          ...input,
          employeeId: employee.id,
          companyId: employee.companyId,
        },
        select: EMPLOYEE_SELECT,
      })
      return { kind: 'created' as const, suggestion: created }
    })

    if (result.kind === 'rate_limited') {
      return apiError(
        429,
        'RATE_LIMITED',
        `You can submit at most ${SUGGESTION_RATE_LIMIT} merchant suggestions in 24 hours.`,
      )
    }
    if (result.kind === 'duplicate') {
      return apiError(
        409,
        'DUPLICATE_SUGGESTION',
        'You already have an open suggestion for a merchant with this email or phone.',
        { existingSuggestionId: result.id },
      )
    }

    void createAuditLog({
      actorType: 'employee',
      actorId: employee.id,
      action: 'MERCHANT_SUGGESTION_CREATED',
      entityType: 'MERCHANT_SUGGESTION',
      entityId: result.suggestion.id,
      metadata: {
        companyId: employee.companyId,
        merchantName: result.suggestion.merchantName,
        loginSource: 'mobile',
      },
    })

    return NextResponse.json(
      { success: true, data: serialize(result.suggestion) },
      { status: 201 },
    )
  } catch (error) {
    return internalError(error)
  }
}

// GET /api/mobile/merchant-suggestions
//
// List the authenticated employee's own suggestions, newest first.
// Query: page, pageSize (max 50), status (optional).
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const { page, pageSize, skip } = parsePagination(searchParams)
    const rawStatus = searchParams.get('status')
    if (rawStatus && !isMerchantSuggestionStatus(rawStatus)) {
      return badRequest('Invalid status filter')
    }
    const status = isMerchantSuggestionStatus(rawStatus) ? rawStatus : null

    const where = {
      employeeId: auth.employee.id,
      ...(status ? { status } : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.merchantSuggestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: EMPLOYEE_SELECT,
      }),
      prisma.merchantSuggestion.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: rows.map(serialize),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    return internalError(error)
  }
}
