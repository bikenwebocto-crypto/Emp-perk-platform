import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service'
import { BUSINESS_NOTIFICATION_TEMPLATES, publishBusinessToAdmins, channels } from '@/services/business-notification.service'
import { getPriorityForCategory } from '@/features/complaints/constants'
import { sanitizeEvidenceUrls } from '@/features/complaints/evidence'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION', message } },
    { status: 400 }
  )
}

function internalError(error: unknown) {
  console.error('Application support complaint API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

const VALID_CATEGORIES = ['TECHNICAL', 'ACCOUNT', 'OTHER'] as const

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (!['employee', 'merchant', 'company_admin'].includes(user.userType)) {
      return unauthorized()
    }

    const body = await request.json()
    const { description, category } = body
    const evidenceUrls = sanitizeEvidenceUrls(body.evidenceUrls)
    if (!description) return badRequest('description is required')

    const validCategory = category && VALID_CATEGORIES.includes(category)
      ? category
      : null
    if (category && !validCategory) {
      return badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`)
    }

    const priority = getPriorityForCategory(validCategory)

    // Resolve exactly one reporter identity based on session role
    let employeeId: string | null = null
    let merchantId: string | null = null
    let companyId: string | null = null
    let reporterName = ''

  if (!user.profileId) return unauthorized()
    if (user.userType === 'employee') {
      const employee = await prisma.employee.findUnique({ where: { id: user.profileId } })
      if (!employee) return unauthorized()
      employeeId = employee.id
      reporterName = `${employee.firstName} ${employee.lastName}`
    } else if (user.userType === 'merchant') {
      const merchant = await prisma.merchant.findUnique({ where: { id: user.profileId } })
      if (!merchant) return unauthorized()
      merchantId = merchant.id
      reporterName = merchant.businessName
    } else if (user.userType === 'company_admin') {
      const companyAdmin = await prisma.companyAdmin.findUnique({
        where: { id: user.profileId },
        include: { company: { select: { id: true, name: true } } },
      })
      if (!companyAdmin) return unauthorized()
      companyId = companyAdmin.companyId
      reporterName = companyAdmin.company.name
    }

    const complaint = await prisma.$transaction(async (tx) => {
      const c = await tx.complaint.create({
        data: {
          offerId: null,
          employeeId,
          merchantId,
          companyId,
          complaintType: 'APPLICATION_SUPPORT',
          category: validCategory,
          description,
          ...(evidenceUrls.length > 0 ? { evidenceUrls } : {}),
          priority: priority as 'LOW' | 'MEDIUM' | 'HIGH',
          status: 'OPEN',
        } as any,
      })

      await tx.complaintAction.create({
        data: {
          complaintId: c.id,
          actorType: user.userType.toUpperCase(),
          employeeId,
          merchantId,
          companyAdminId: user.userType === 'company_admin' ? user.profileId : null,
          actionType: 'REVIEWED',
          notes: 'Application support request filed',
        },
      })

      return c
    })

    await createAuditLog(
      fromCurrentUser(user, 'APPLICATION_SUPPORT_CREATED', 'complaint', complaint.id, {
        metadata: { reporterName, category: validCategory, priority: complaint.priority },
      }),
    )

    const template = BUSINESS_NOTIFICATION_TEMPLATES.complaintCreated(`Application Support — ${reporterName}`)
    await publishBusinessToAdmins({
      ...template,
      channels: channels('IN_APP', 'PUSH'),
      referenceType: 'complaint',
      referenceId: complaint.id,
      metadata: { complaintId: complaint.id, reporterType: user.userType, reporterName },
    })

    return NextResponse.json({ success: true, data: complaint }, { status: 201 })
  } catch (error) {
    return internalError(error)
  }
}