import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { internalError, notFound } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { APPLICATION_SUPPORT_CATEGORIES } from '@/features/complaints/constants'

const TICKET_INCLUDE = {
  offer: {
    select: {
      id: true,
      title: true,
      status: true,
    },
  },

  merchant: {
    select: {
      id: true,
      businessName: true,
      logoUrl: true,
    },
  },

  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },

  company: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },

  actions: {
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
} as const

type TicketWithRelations = Prisma.ComplaintGetPayload<{
  include: typeof TICKET_INCLUDE
}>

function serializeTicket(complaint: TicketWithRelations) {
  const isSupport =
    complaint.complaintType === 'APPLICATION_SUPPORT'

  let subject: string

  if (isSupport) {
    const label = APPLICATION_SUPPORT_CATEGORIES.find(
      (category) => category.value === complaint.category,
    )?.label

    subject = label
      ? `Application Support — ${label}`
      : 'Application Support'
  } else {
    subject = complaint.offer?.title
      ? `Offer: ${complaint.offer.title}`
      : 'Offer Complaint'
  }

  return {
    id: complaint.id,

    offerId: complaint.offerId,

    employeeId: complaint.employeeId,

    merchantId: complaint.merchantId,

    companyId: complaint.companyId,

    complaintType: complaint.complaintType,

    category: complaint.category,

    description: complaint.description,

    evidenceUrls: Array.isArray(complaint.evidenceUrls)
      ? complaint.evidenceUrls.filter(
          (url): url is string => typeof url === 'string',
        )
      : [],

    status: complaint.status,

    priority: complaint.priority,

    escalationNote: complaint.escalationNote,

    resolutionNotes: complaint.resolutionNotes,

    resolvedAt: complaint.resolvedAt
      ? complaint.resolvedAt.toISOString()
      : null,

    createdAt: complaint.createdAt.toISOString(),

    updatedAt: complaint.updatedAt.toISOString(),

    offer: complaint.offer
      ? {
          id: complaint.offer.id,
          title: complaint.offer.title,
          status: complaint.offer.status,
        }
      : null,

    merchant: complaint.merchant
      ? {
          id: complaint.merchant.id,
          businessName: complaint.merchant.businessName,
          logoUrl: complaint.merchant.logoUrl,
        }
      : null,

    employee: complaint.employee
      ? {
          id: complaint.employee.id,
          firstName: complaint.employee.firstName,
          lastName: complaint.employee.lastName,
        }
      : null,

    company: complaint.company
      ? {
          id: complaint.company.id,
          name: complaint.company.name,
          email: complaint.company.email,
        }
      : null,

    actions: complaint.actions.map((action) => ({
      id: action.id,
      complaintId: action.complaintId,
      actorType: action.actorType,
      adminId: action.adminId,
      companyAdminId: action.companyAdminId,
      employeeId: action.employeeId,
      merchantId: action.merchantId,
      actionType: action.actionType,
      notes: action.notes ?? null,
      createdAt: action.createdAt.toISOString(),
    })),

    escalations: [],
  }
}

// GET /api/mobile/tickets/[id]
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>
  },
) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)

    if (!auth.ok) {
      return auth.response
    }

    const { id } = await params

    const complaint = await prisma.complaint.findFirst({
      where: {
        id,
        employeeId: auth.employee.id,
      },
      include: TICKET_INCLUDE,
    })

    if (!complaint) {
      return notFound('Ticket not found')
    }

    return NextResponse.json({
      success: true,
      data: serializeTicket(complaint),
    })
  } catch (error) {
    return internalError(error)
  }
}
