import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCompanyAdmin, handleApiError } from '../helpers'

const allowedStatuses = ['PENDING', 'APPROVED', 'REJECTED'] as const

type RequestStatus = (typeof allowedStatuses)[number]

function normalizeStatus(value: string | null): RequestStatus | null {
  if (!value) return null
  const normalized = value.toUpperCase().trim()
  return allowedStatuses.includes(normalized as RequestStatus)
    ? normalized as RequestStatus
    : null
}

export async function GET(request: NextRequest) {
  try {
    const { company } = await getCompanyAdmin()
    const status = normalizeStatus(request.nextUrl.searchParams.get('status'))

    const requests = await prisma.profileDeactivationRequest.findMany({
      where: {
        companyId: company.id,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          include: {
            account: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: requests.map((request) => ({
        id: request.id,
        status: request.status,
        reason: request.reason,
        reviewNote: request.reviewNote,
        reviewedAt: request.reviewedAt,
        createdAt: request.createdAt,
        employee: request.employee
          ? {
              id: request.employee.id,
              firstName: request.employee.firstName,
              lastName: request.employee.lastName,
              status: request.employee.status,
              accountId: request.employee.accountId,
              account: request.employee.account ? { email: request.employee.account.email } : null,
            }
          : null,
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
