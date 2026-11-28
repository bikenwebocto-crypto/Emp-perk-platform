import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { createAuditLog } from '@/services/audit-log.service'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}

function notFound(entity: string) {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: `${entity} not found` } },
    { status: 404 }
  )
}

function internalError(error: unknown) {
  console.error('Admin banner toggle API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') return unauthorized()

    const { id } = await params
    const existing = await prisma.banner.findUnique({ where: { id } })
    if (!existing) return notFound('Banner')

    const body = await request.json()
    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'isActive boolean is required' } },
        { status: 400 }
      )
    }

    const banner = await prisma.$transaction(async (tx) => {
      const row = await tx.banner.update({
        where: { id },
        data: { isActive: body.isActive },
      })
      await createAuditLog({
        actorType: 'admin',
        adminId: user.profileId,
        action: body.isActive ? 'BANNER_ACTIVATED' : 'BANNER_DEACTIVATED',
        entityType: 'BANNER',
        entityId: id,
        changes: { isActive: { from: existing.isActive, to: body.isActive } },
      }, tx)
      return row
    })

    return NextResponse.json({ success: true, data: banner })
  } catch (error) {
    return internalError(error)
  }
}
