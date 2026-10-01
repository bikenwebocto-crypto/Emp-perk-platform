import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { update: vi.fn() },
    employee: { update: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({
  getAuthenticatedMobileEmployee: vi.fn(),
  buildMobileAuthProfile: vi.fn((account, employee, company) => ({
    employeeId: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: account.email,
    company: { id: company.id, name: company.name, status: company.status },
    role: 'EMPLOYEE',
  })),
}))
vi.mock('@/lib/device-token.service', () => ({
  activateDeviceToken: vi.fn().mockResolvedValue({ id: 'device-token-1' }),
}))
vi.mock('@/services/audit-log.service', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { activateDeviceToken } from '@/lib/device-token.service'
import { POST } from '@/app/api/mobile/auth/sync/route'

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/mobile/auth/sync', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as any
}

const account = { authUserId: 'auth-user-1', email: 'employee@example.com' }
const employee = { id: 'emp-1', firstName: 'Jane', lastName: 'Doe' }
const company = { id: 'company-1', name: 'Acme Co', status: 'ACTIVE' }

describe('POST /api/mobile/auth/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.account.update as any).mockResolvedValue(account)
    ;(prisma.employee.update as any).mockResolvedValue(employee)
  })

  it('returns the auth helper response when the account is not mapped', async () => {
    const forbiddenResponse = NextResponse.json(
      { success: false, error: { code: 'ACCOUNT_NOT_MAPPED', message: 'not mapped' } },
      { status: 403 },
    )
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: forbiddenResponse })

    const res = await POST(postRequest({}))

    expect(res.status).toBe(403)
    expect(prisma.account.update).not.toHaveBeenCalled()
  })

  it('refreshes login timestamps and returns the mobile profile', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, account, employee, company })

    const res = await POST(postRequest({}))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.employeeId).toBe('emp-1')
    expect(json.data.company).toEqual({ id: 'company-1', name: 'Acme Co', status: 'ACTIVE' })
    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { authUserId: 'auth-user-1' } }),
    )
    expect(prisma.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'emp-1' } }),
    )
  })

  it('activates the device token only when an fcmToken is supplied', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, account, employee, company })

    await POST(postRequest({ fcmToken: 'push-token', deviceId: 'device-1' }))

    expect(activateDeviceToken).toHaveBeenCalledWith({
      userId: 'auth-user-1',
      token: 'push-token',
      deviceId: 'device-1',
    })
  })

  it('skips device-token activation when no fcmToken is provided', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, account, employee, company })

    await POST(postRequest({}))

    expect(activateDeviceToken).not.toHaveBeenCalled()
  })
})
