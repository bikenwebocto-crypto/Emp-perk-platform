import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'
import { createAuditLog } from '@/services/audit-log.service'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}
function notFound() {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Merchant not found' } },
    { status: 404 }
  )
}
function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION', message } },
    { status: 400 }
  )
}
function internalError(error: unknown) {
  console.error('Merchant issues API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

const VALID_CATEGORIES = ['technical', 'offer_problem', 'employee_complaint', 'billing', 'other'] as const
const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

async function getOrCreateSystemEmployee(): Promise<string> {
  const sysEmail = 'merchant-issues-system@perks.local'
  const account = await prisma.account.findUnique({ where: { email: sysEmail } })
  if (account) {
    const existing = await prisma.employee.findFirst({ where: { accountId: account.authUserId } })
    if (existing) return existing.id
  }
  const anyCompany = await prisma.company.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } })
  if (!anyCompany) throw new Error('No company available for system employee')
  const pkId = crypto.randomUUID()
  const sys = await prisma.employee.create({
    data: {
      id: pkId,
      companyId: anyCompany.id,
      firstName: 'Merchant',
      lastName: 'Issues System',
      status: 'INACTIVE',
      accountId: pkId,
    },
  })
  await prisma.account.create({
    data: {
      authUserId: pkId,
      email: sysEmail,
      profileType: 'EMPLOYEE',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    },
  })
  return sys.id
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') ?? '20')))
    const status = searchParams.get('status') ?? undefined
    const q = searchParams.get('q') ?? undefined

    const where: any = { merchantId: merchant.id }
    if (status) where.status = status
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [rows, total, openCount] = await Promise.all([
      prisma.issueReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.issueReport.count({ where }),
      prisma.issueReport.count({
        where: { merchantId: merchant.id, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: rows,
      metrics: { open: openCount },
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    return internalError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound()

    const body = await request.json()
    const { title, description, category, priority } = body

    if (!title || title.trim().length < 3) return badRequest('Title is required (min 3 characters)')
    if (!description || description.trim().length < 5) return badRequest('Description is required')
    if (!VALID_CATEGORIES.includes(category)) return badRequest(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`)
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return badRequest(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`)
    }

    // const systemEmployeeId = await getOrCreateSystemEmployee()

    const issue = await prisma.issueReport.create({
      data: {
        merchantId: merchant.id,
        title: title.trim(),
        description: description.trim(),
        category,
        priority: priority ?? 'normal',
        status: 'OPEN',
      },
    })

    await prisma.actionQueueItem.create({
      data: {
        type: 'ISSUE_REVIEW',
        title: `Issue from ${merchant.businessName}: ${title}`,
        description: description.slice(0, 200),
        referenceId: merchant.id,
        referenceType: 'issue',
        merchantId: merchant.id,
        status: 'PENDING',
        priority: priority === 'urgent' ? 4 : priority === 'high' ? 3 : 2,
        metadata: {
          queueType: 'OPEN_ISSUE',
          merchantId: merchant.id,
          merchantName: merchant.businessName,
          category,
          issueId: issue.id,
          reportedBy: 'MERCHANT',
        } as any,
      },
    })

    await createAuditLog({
      actorType: 'merchant',
      actorId: merchant.id,
      action: 'ISSUE_CREATED',
      entityType: 'issue_report',
      entityId: issue.id,
      metadata: { title, category, priority: priority ?? 'normal' },
    })

    return NextResponse.json({ success: true, data: issue, message: 'Issue submitted for review' }, { status: 201 })
  } catch (error) {
    return internalError(error)
  }
}
