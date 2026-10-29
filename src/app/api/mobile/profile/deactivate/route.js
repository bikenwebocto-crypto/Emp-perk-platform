import { NextResponse } from 'next/server'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { prisma } from '@/lib/prisma'

function authError(status, code, message, extra = {}) {
  return NextResponse.json(
    { success: false, error: { code, message, ...extra } },
    { status }
  )
}

export async function POST(request) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) {
      return auth.response
    }

    const { employee, company } = auth
    const employeeId = employee.id
    const companyId = company.id

    let body = {}
    try {
      const contentType = request.headers.get('content-type') || ''
      const text = await request.text()
      if (text) {
        try {
          const parsed = JSON.parse(text)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            body = parsed
          }
        } catch {
          // ignore invalid JSON
        }
      }
    } catch {
      // ignore
    }

    const reason =
      typeof body.reason === 'string' && body.reason.trim().length > 0
        ? body.reason.trim()
        : null

    const existing = await prisma.profileDeactivationRequest.findFirst({
      where: {
        employeeId,
        status: 'PENDING',
      },
    })

    if (existing) {
      return authError(409, 'DEACTIVATION_REQUEST_EXISTS', 'A pending deactivation request already exists.')
    }

    const created = await prisma.profileDeactivationRequest.create({
      data: {
        employeeId,
        companyId,
        reason,
        status: 'PENDING',
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          id: created.id,
          status: created.status,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/mobile/profile/deactivate error:', error)
    return authError(500, 'INTERNAL_SERVER_ERROR', 'Internal server error')
  }
}
