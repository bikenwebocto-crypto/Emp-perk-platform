import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/mobile-auth', () => ({
  getAuthenticatedMobileEmployee: vi.fn(),
}))
vi.mock('@/services/mobile-home.service', () => ({
  getMobileHomeHeavy: vi.fn(),
}))
vi.mock('@/services/audit-log.service', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { getMobileHomeHeavy } from '@/services/mobile-home.service'
import { GET } from '@/app/api/mobile/employee/offers/route'

function getRequest(query = '') {
  return new NextRequest(`http://localhost/api/mobile/employee/offers${query}`)
}

const employee = { id: 'emp-1', companyId: 'company-1', firstName: 'Jane', lastName: 'Doe', avatarUrl: null }
const company = { id: 'company-1' }

describe('GET /api/mobile/employee/offers', () => {
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
    expect(getMobileHomeHeavy).not.toHaveBeenCalled()
  })

  it('returns the heavy offer sections for a valid employee', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee, company })
    const sections = [
      { id: 'nearBrands', title: 'Brands Near You', type: 'merchant', items: [] },
      { id: 'forYou', title: 'Recommended For You', type: 'offer', items: [] },
    ]
    ;(getMobileHomeHeavy as any).mockResolvedValue(sections)

    const res = await GET(getRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ success: true, data: sections })
    expect(getMobileHomeHeavy).toHaveBeenCalledWith({ employee, location: null })
  })

  it('parses valid lat/lng query params into a location', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee, company })
    ;(getMobileHomeHeavy as any).mockResolvedValue([])

    await GET(getRequest('?lat=51.5&lng=-0.1'))

    expect(getMobileHomeHeavy).toHaveBeenCalledWith({
      employee,
      location: { latitude: 51.5, longitude: -0.1 },
    })
  })

  it('ignores a missing lng and falls back to no location', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee, company })
    ;(getMobileHomeHeavy as any).mockResolvedValue([])

    await GET(getRequest('?lat=51.5'))

    expect(getMobileHomeHeavy).toHaveBeenCalledWith({ employee, location: null })
  })
})
