import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/mobile-auth', () => ({
  getAuthenticatedMobileEmployee: vi.fn(),
}))
vi.mock('@/lib/device-token.service', () => ({
  activateDeviceToken: vi.fn(),
}))
vi.mock('@/services/audit-log.service', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { activateDeviceToken } from '@/lib/device-token.service'
import { POST } from '@/app/api/mobile/devices/route'

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/mobile/devices', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as any
}

const account = { authUserId: 'auth-user-1' }
const employee = { id: 'emp-1' }

describe('POST /api/mobile/devices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(activateDeviceToken as any).mockResolvedValue({ id: 'device-token-1' })
  })

  it('returns the auth helper response when unauthenticated', async () => {
    const unauthorizedResponse = NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Bearer token' } },
      { status: 401 },
    )
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: unauthorizedResponse })

    const res = await POST(postRequest({ fcmToken: 'token-1' }))

    expect(res.status).toBe(401)
    expect(activateDeviceToken).not.toHaveBeenCalled()
  })

  it('returns 400 when fcmToken is missing', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, account, employee })

    const res = await POST(postRequest({ deviceId: 'device-1' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.code).toBe('FCM_TOKEN_REQUIRED')
    expect(activateDeviceToken).not.toHaveBeenCalled()
  })

  it('registers the device token using the authenticated userId, not a body-supplied one', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, account, employee })

    const res = await POST(postRequest({ fcmToken: 'push-token', deviceId: 'device-1', userId: 'someone-else' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ success: true })
    expect(activateDeviceToken).toHaveBeenCalledWith({
      userId: 'auth-user-1',
      token: 'push-token',
      deviceId: 'device-1',
    })
  })
})
