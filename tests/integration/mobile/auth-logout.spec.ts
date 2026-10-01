import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/mobile-auth', () => ({
  getAuthenticatedMobileEmployee: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/services/audit-log.service', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/device-token.service', () => ({
  deactivateDeviceToken: vi.fn().mockResolvedValue({ count: 1 }),
}))

import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { createClient } from '@/lib/supabase/server'
import { deactivateDeviceToken } from '@/lib/device-token.service'
import { POST } from '@/app/api/mobile/auth/logout/route'

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/mobile/auth/logout', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as any
}

const signOut = vi.fn().mockResolvedValue({ error: null })

describe('POST /api/mobile/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(createClient as any).mockResolvedValue({ auth: { signOut } })
    signOut.mockResolvedValue({ error: null })
  })

  it('returns the auth helper response when unauthenticated', async () => {
    const unauthorizedResponse = NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Bearer token' } },
      { status: 401 },
    )
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: unauthorizedResponse })

    const res = await POST(postRequest({}))

    expect(res.status).toBe(401)
    expect(deactivateDeviceToken).not.toHaveBeenCalled()
  })

  it('deactivates the device token, signs out of Supabase, and returns success', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({
      ok: true,
      account: { authUserId: 'auth-user-1' },
      employee: { id: 'emp-1' },
    })

    const res = await POST(postRequest({ deviceId: 'device-1', fcmToken: 'token-1' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ success: true })
    expect(deactivateDeviceToken).toHaveBeenCalledWith({
      userId: 'auth-user-1',
      deviceId: 'device-1',
      token: 'token-1',
    })
    expect(signOut).toHaveBeenCalled()
  })

  it('still succeeds with no request body (device-token targeting omitted)', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({
      ok: true,
      account: { authUserId: 'auth-user-1' },
      employee: { id: 'emp-1' },
    })

    const res = await POST(postRequest(undefined))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(deactivateDeviceToken).toHaveBeenCalledWith({
      userId: 'auth-user-1',
      deviceId: null,
      token: null,
    })
  })
})
