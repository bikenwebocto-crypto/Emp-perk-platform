import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { internalError, notFound, badRequest } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { createAuditLog } from '@/services/audit-log.service'
import {
  BUSINESS_NOTIFICATION_TEMPLATES,
  channels,
  publishBusinessToAdmins,
} from '@/services/business-notification.service'
import {
  APPLICATION_SUPPORT_CATEGORIES,
  getPriorityForCategory,
  getPriorityForType,
} from '@/features/complaints/constants'
import { sanitizeEvidenceUrls } from '@/features/complaints/evidence'

const OFFER_COMPLAINT_TYPES = [
  'MISLEADING',
  'INVALID_TERMS',
  'NON_FUNCTIONAL',
  'POLICY_VIOLATION',
] as const

// The only status transitions a mobile employee (the reporter) may initiate.
// Everything else (RESOLVED, REJECTED, ESCALATED, …) is admin-controlled.
const EMPLOYEE_STATUS_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['CLARIFICATION_REQ'],
  UNDER_REVIEW: ['CLARIFICATION_REQ'],
  CLARIFICATION_REQ: ['UNDER_REVIEW'],
}

interface TicketOffer {
  id: string
  title: string
  status: string
}

interface TicketRecord {
  id: string
  complaintType: string
  offerId: string | null
  offer: TicketOffer | null
  category: string | null
  description: string
  status: string
  priority: string
  evidenceUrls: unknown
  createdAt: Date
  updatedAt: Date
}

interface TicketResponse {
  id: string
  type: 'OFFER' | 'APPLICATION_SUPPORT'
  offerId: string | null
  subject: string
  description: string
  status: string
  priority: string
  category: string | null
  evidenceUrls: string[]
  createdAt: string
  updatedAt: string
}

function serializeTicket(c: TicketRecord): TicketResponse {
  const isSupport = c.complaintType === 'APPLICATION_SUPPORT'

  let subject: string
  if (isSupport) {
    const label = APPLICATION_SUPPORT_CATEGORIES.find((x) => x.value === c.category)?.label
    subject = label ? `Application Support — ${label}` : 'Application Support'
  } else {
    subject = c.offer?.title ? `Offer: ${c.offer.title}` : 'Offer Complaint'
  }

  return {
    id: c.id,
    type: isSupport ? 'APPLICATION_SUPPORT' : 'OFFER',
    offerId: c.offerId,
    subject,
    description: c.description,
    status: c.status,
    priority: c.priority,
    category: c.category,
    evidenceUrls: Array.isArray(c.evidenceUrls)
      ? c.evidenceUrls.filter((u): u is string => typeof u === 'string')
      : [],
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

const TICKET_INCLUDE = {
  offer: { select: { id: true, title: true, status: true } },
} as const

// POST /api/mobile/tickets
//
// Create a ticket (Complaint record) for the authenticated mobile employee.
//   type:   'OFFER' | 'APPLICATION_SUPPORT'
//   offerId (OFFER only), complaintType (OFFER optional, defaults NON_FUNCTIONAL),
//   category (APPLICATION_SUPPORT optional), description, evidenceUrls[]
//
// employeeId is NEVER read from the client — the identity is resolved from
// the Supabase Bearer token via getAuthenticatedMobileEmployee.
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response
    const { employee } = auth

    const body = await request.json()
    const { type, offerId, complaintType, category, description } = body
    const evidenceUrls = sanitizeEvidenceUrls(body.evidenceUrls)

    if (type !== 'OFFER' && type !== 'APPLICATION_SUPPORT') {
      return badRequest('type must be OFFER or APPLICATION_SUPPORT')
    }
    if (typeof description !== 'string' || !description.trim()) {
      return badRequest('description is required')
    }

    let offer: { id: string; merchantId: string } | null = null
    let complaintTypeValue: string
    let priority: string
    let categoryValue: string | null = null

    if (type === 'OFFER') {
      if (typeof offerId !== 'string' || !offerId) {
        return badRequest('offerId is required for OFFER tickets')
      }
      offer = await prisma.merchantOffer.findUnique({
        where: { id: offerId },
        select: { id: true, merchantId: true },
      })
      if (!offer) return notFound('Offer not found')

      if (complaintType !== undefined && complaintType !== null) {
        if (!OFFER_COMPLAINT_TYPES.includes(complaintType)) {
          return badRequest(
            'Invalid complaintType. Must be one of: ' + OFFER_COMPLAINT_TYPES.join(', '),
          )
        }
        complaintTypeValue = complaintType
      } else {
        complaintTypeValue = 'NON_FUNCTIONAL'
      }
      priority = getPriorityForType(complaintTypeValue)
    } else {
      if (
        category !== undefined &&
        category !== null &&
        !APPLICATION_SUPPORT_CATEGORIES.some((c) => c.value === category)
      ) {
        return badRequest(
          'Invalid category. Must be one of: ' +
            APPLICATION_SUPPORT_CATEGORIES.map((c) => c.value).join(', '),
        )
      }
      categoryValue = category ?? null
      complaintTypeValue = 'APPLICATION_SUPPORT'
      priority = getPriorityForCategory(categoryValue)
    }

    const complaint = await prisma.$transaction(async (tx) => {
      const c = await tx.complaint.create({
        data: {
          offerId: offer ? offer.id : null,
          employeeId: employee.id,
          merchantId: offer ? offer.merchantId : null,
          companyId: employee.companyId,
          complaintType: complaintTypeValue,
          category: categoryValue,
          description: description.trim(),
          ...(evidenceUrls.length > 0 ? { evidenceUrls } : {}),
          priority,
          status: 'OPEN',
        } as any,
      })

      await tx.complaintAction.create({
        data: {
          complaintId: c.id,
          actorType: 'EMPLOYEE',
          employeeId: employee.id,
          actionType: 'REVIEWED',
          notes: 'Complaint filed via mobile',
        },
      })

      return c
    })

    await createAuditLog({
      actorType: 'employee',
      actorId: employee.id,
      action: 'COMPLAINT_CREATED',
      entityType: 'COMPLAINT',
      entityId: complaint.id,
      metadata: {
        complaintType: complaintTypeValue,
        offerId: offer?.id ?? null,
        loginSource: 'mobile',
      },
    })

    const template = BUSINESS_NOTIFICATION_TEMPLATES.complaintCreated(`Mobile ${type} ticket`)
    await publishBusinessToAdmins({
      ...template,
      channels: channels('IN_APP', 'PUSH'),
      referenceType: 'complaint',
      referenceId: complaint.id,
      metadata: {
        complaintId: complaint.id,
        offerId: offer?.id ?? null,
        merchantId: offer?.merchantId ?? null,
        employeeId: employee.id,
        loginSource: 'mobile',
      },
    })

    const created = await prisma.complaint.findUnique({
      where: { id: complaint.id },
      include: TICKET_INCLUDE,
    })

    return NextResponse.json(
      { success: true, data: serializeTicket(created as unknown as TicketRecord) },
      { status: 201 },
    )
  } catch (error) {
    return internalError(error)
  }
}

// GET /api/mobile/tickets
//
// List the authenticated employee's own tickets (paginated, optional status /
// type filters), or fetch a single ticket with ?id=<id>. Ownership is always
// enforced — tickets belonging to other employees are never returned.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      const complaint = await prisma.complaint.findFirst({
        where: { id, employeeId: auth.employee.id },
        include: TICKET_INCLUDE,
      })
      if (!complaint) return notFound('Ticket not found')
      return NextResponse.json({
        success: true,
        data: serializeTicket(complaint as unknown as TicketRecord),
      })
    }

    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') ?? '20')))
    const status = searchParams.get('status')
    const type = searchParams.get('type')

    const where: Record<string, unknown> = { employeeId: auth.employee.id }
    if (status) where.status = status
    if (type === 'OFFER') where.complaintType = { not: 'APPLICATION_SUPPORT' }
    if (type === 'APPLICATION_SUPPORT') where.complaintType = 'APPLICATION_SUPPORT'

    const [rows, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: TICKET_INCLUDE,
      }),
      prisma.complaint.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: (rows as unknown as TicketRecord[]).map(serializeTicket),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    return internalError(error)
  }
}

// PATCH /api/mobile/tickets?id=<id>
//
// The employee (reporter) may only update fields they own:
//   - description (their own ticket copy)
//   - evidenceUrls (replace the evidence set, sanitized, max 5)
//   - status   — only the transitions in EMPLOYEE_STATUS_TRANSITIONS
//
// Admin-controlled fields (priority, resolvedAt, escalationNote,
// resolutionNotes, assignment, employeeId, …) are never accepted.
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return badRequest('id query parameter is required')

    const body = await request.json()

    const complaint = await prisma.complaint.findFirst({
      where: { id, employeeId: auth.employee.id },
    })
    if (!complaint) return notFound('Ticket not found')

    const updateData: Record<string, unknown> = {}
    const actionData: any = {
      complaintId: id,
      actorType: 'EMPLOYEE',
      employeeId: auth.employee.id,
    }

    let autoTransition = false
    let statusExplicit = false

    if (body.description !== undefined) {
      if (typeof body.description !== 'string' || !body.description.trim()) {
        return badRequest('description cannot be empty')
      }
      updateData.description = body.description.trim()
      if (complaint.status === 'CLARIFICATION_REQ') autoTransition = true
    }

    if (body.evidenceUrls !== undefined) {
      updateData.evidenceUrls = sanitizeEvidenceUrls(body.evidenceUrls)
      if (complaint.status === 'CLARIFICATION_REQ') autoTransition = true
    }

    if (body.status !== undefined && body.status !== null) {
      const allowed = EMPLOYEE_STATUS_TRANSITIONS[complaint.status] ?? []
      if (!allowed.includes(body.status)) {
        return badRequest(`Invalid status transition from ${complaint.status} to ${body.status}`)
      }
      updateData.status = body.status
      statusExplicit = true
    }

    if (autoTransition && !statusExplicit) {
      // Reporter provided the requested info/evidence on a CLARIFICATION_REQ
      // ticket — move it back under review (mirrors the merchant flow).
      updateData.status = 'UNDER_REVIEW'
    }

    if (Object.keys(updateData).length === 0) return badRequest('No valid fields to update')

    if (updateData.status && updateData.status !== complaint.status) {
      actionData.actionType = 'REVIEWED'
      actionData.notes = `Status changed to ${updateData.status}`
    } else {
      actionData.actionType = updateData.description ? 'RESPONDED' : 'REVIEWED'
      actionData.notes = 'Ticket updated via mobile'
    }

    await prisma.$transaction(async (tx) => {
      await tx.complaint.update({
        where: { id },
        data: { ...updateData, updatedAt: new Date() },
      })
      await tx.complaintAction.create({ data: actionData })
    })

    void createAuditLog({
      actorType: 'employee',
      actorId: auth.employee.id,
      action: 'COMPLAINT_UPDATED',
      entityType: 'COMPLAINT',
      entityId: id,
      metadata: { updates: Object.keys(updateData), loginSource: 'mobile' },
    })

    const updated = await prisma.complaint.findUnique({
      where: { id },
      include: TICKET_INCLUDE,
    })

    return NextResponse.json({
      success: true,
      data: serializeTicket(updated as unknown as TicketRecord),
    })
  } catch (error) {
    return internalError(error)
  }
}