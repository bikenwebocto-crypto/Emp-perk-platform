import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/services/audit-log.service'
import { getCompanyAdmin, handleApiError } from '../../helpers'

export async function POST(request: NextRequest) {
  try {
    const { company, companyAdmin } = await getCompanyAdmin()
    const body = await request.json()
    const { reason } = body

    if (!reason || reason.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'Please provide a reason (at least 10 characters)' } },
        { status: 400 },
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: company.id },
        data: { status: 'CANCELLED', adminNote: `Cancellation requested: ${reason}` },
      })
      await tx.companyStatusHistory.create({
        data: {
          companyId: company.id,
          fromStatus: company.status,
          toStatus: 'CANCELLED',
          changedBy: companyAdmin.id,
          changedByType: 'COMPANY_ADMIN',
          reason,
        },
      })
      await createAuditLog({
        actorType: 'company_admin',
        actorId: companyAdmin.id,
        action: 'CANCELLATION_REQUESTED',
        entityType: 'COMPANY',
        entityId: company.id,
        metadata: { requestedBy: companyAdmin.id, reason },
      }, tx)
    })

    return NextResponse.json({ success: true, message: 'Cancellation request submitted' })
  } catch (error) {
    return handleApiError(error)
  }
}
