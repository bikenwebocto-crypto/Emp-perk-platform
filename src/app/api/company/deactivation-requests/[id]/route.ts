import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAdminClient } from '@/lib/supabase/admin'
import { createAuditLog } from '@/services/audit-log.service'
import { getCompanyAdmin, handleApiError } from '../../helpers'

const decisionMap = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
} as const

type DecisionAction = keyof typeof decisionMap

function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

async function handleDecision(
  request: NextRequest,
  companyAdmin: Awaited<ReturnType<typeof getCompanyAdmin>>['companyAdmin'],
  companyId: string,
  requestId: string,
) {
  const body = await request.json().catch(() => ({}))
  const action = typeof body.action === 'string' ? body.action.toUpperCase() : ''

  if (!Object.hasOwn(decisionMap, action)) {
    return apiError(400, 'VALIDATION', 'Action must be APPROVE or REJECT')
  }

  const reviewNote = typeof body.reviewNote === 'string' ? body.reviewNote.trim() : ''

  const existing = await prisma.profileDeactivationRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: {
        include: {
          account: true,
        },
      },
    },
  })

  if (!existing) {
    return apiError(404, 'NOT_FOUND', 'Deactivation request not found')
  }

  if (existing.companyId !== companyId) {
    return apiError(403, 'FORBIDDEN', 'This request does not belong to your company')
  }

  if (existing.status !== 'PENDING') {
    return apiError(409, 'ALREADY_PROCESSED', 'This deactivation request has already been processed')
  }

  const nextStatus = decisionMap[action as DecisionAction]

  const updatedRequest = await prisma.$transaction(async (tx) => {
    const requestUpdate = await tx.profileDeactivationRequest.update({
      where: { id: requestId },
      data: {
        status: nextStatus,
        reviewedById: companyAdmin.id,
        reviewedByType: 'COMPANY_ADMIN',
        reviewNote: action === 'REJECT' && reviewNote ? reviewNote : null,
        reviewedAt: new Date(),
      },
    })

    if (action === 'APPROVE') {
      await tx.employee.update({
        where: { id: existing.employeeId },
        data: { status: 'INACTIVE' },
      })

      if (existing.employee.accountId) {
        await tx.account.update({
          where: { authUserId: existing.employee.accountId },
          data: {
            status: 'INACTIVE',
            changedBy: companyAdmin.id,
          },
        })
      }

      await tx.loginSession.updateMany({
        where: {
          employeeId: existing.employeeId,
          isActive: true,
        },
        data: { isActive: false },
      })

      await createAuditLog({
        actorType: 'company_admin',
        companyAdminId: companyAdmin.id,
        action: 'EMPLOYEE_DEACTIVATED',
        entityType: 'employee',
        entityId: existing.employeeId,
        changes: {
          employeeStatus: { from: existing.employee.status, to: 'INACTIVE' },
          ...(existing.employee.accountId && {
            accountStatus: { from: existing.employee.account?.status ?? null, to: 'INACTIVE' },
          }),
        },
        metadata: { companyId, deactivationRequestId: requestId },
      }, tx)
    }

    await createAuditLog({
      actorType: 'company_admin',
      companyAdminId: companyAdmin.id,
      action: action === 'APPROVE' ? 'DEACTIVATION_REQUEST_APPROVED' : 'DEACTIVATION_REQUEST_REJECTED',
      entityType: 'profile_deactivation_request',
      entityId: requestId,
      changes: { status: { from: existing.status, to: nextStatus } },
      metadata: {
        companyId,
        employeeId: existing.employeeId,
        reviewNote: action === 'REJECT' && reviewNote ? reviewNote : null,
      },
    }, tx)

    return requestUpdate
  })

  // Supabase is outside the database, so sign out only after the deactivation is saved.
  if (action === 'APPROVE' && existing.employee.accountId) {
    try {
      await getAdminClient().auth.admin.signOut(existing.employee.accountId)
    } catch (error) {
      console.warn('Unable to sign out employee auth session during deactivation:', error)
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      id: updatedRequest.id,
      status: updatedRequest.status,
      reviewedAt: updatedRequest.reviewedAt,
      reviewedById: updatedRequest.reviewedById,
      reviewNote: updatedRequest.reviewNote,
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { company, companyAdmin } = await getCompanyAdmin()
    const { id } = await params
    return await handleDecision(request, companyAdmin, company.id, id)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { company, companyAdmin } = await getCompanyAdmin()
    const { id } = await params
    return await handleDecision(request, companyAdmin, company.id, id)
  } catch (error) {
    return handleApiError(error)
  }
}
