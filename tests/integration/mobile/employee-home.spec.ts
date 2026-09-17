import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/mobile-auth', () => ({
  getAuthenticatedMobileEmployee: vi.fn(),
}))
vi.mock('@/services/mobile-home.service', () => ({
  getMobileHomeLight: vi.fn(),
}))
vi.mock('@/services/audit-log.service', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { getMobileHomeLight } from '@/services/mobile-home.service'
import { GET } from '@/app/api/mobile/employee/home/route'

function getRequest(query = '') {
  return new NextRequest(`http://localhost/api/mobile/employee/home${query}`)
}

const employee = { id: 'emp-1', companyId: 'company-1', firstName: 'Jane', lastName: 'Doe', avatarUrl: null }
const company = { id: 'company-1' }

describe('GET /api/mobile/employee/home', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the auth helper response when unauthenticated', async () => {
    const unauthorizedResponse = NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Bearer token' } },
      { status: 401 },
    )
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: unauthorizedResponse })

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
    expect(getMobileHomeLight).not.toHaveBeenCalled()
  })

  it('returns the light home payload for a valid employee', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee, company })
    const homeData = { user: { id: 'emp-1' }, sections: [] }
    ;(getMobileHomeLight as any).mockResolvedValue(homeData)

    const res = await GET(getRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ success: true, data: homeData })
    expect(getMobileHomeLight).toHaveBeenCalledWith({ employee, location: null })
  })

  it('parses valid lat/lng query params into a location', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee, company })
    ;(getMobileHomeLight as any).mockResolvedValue({ user: {}, sections: [] })

    await GET(getRequest('?lat=40.7&lng=-74.0'))

    expect(getMobileHomeLight).toHaveBeenCalledWith({
      employee,
      location: { latitude: 40.7, longitude: -74.0 },
    })
  })

  it('ignores out-of-range lat/lng and falls back to no location', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee, company })
    ;(getMobileHomeLight as any).mockResolvedValue({ user: {}, sections: [] })

    await GET(getRequest('?lat=999&lng=-74.0'))

    expect(getMobileHomeLight).toHaveBeenCalledWith({ employee, location: null })
  })
})
