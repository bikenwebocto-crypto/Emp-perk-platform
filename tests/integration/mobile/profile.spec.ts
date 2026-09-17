import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    redemption: { count: vi.fn(), findMany: vi.fn() },
    employeeAddress: { findUnique: vi.fn(), upsert: vi.fn() },
    notificationEvent: { count: vi.fn() },
    employee: { update: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))
vi.mock('@/services/audit-log.service', () => ({ createAuditLog: vi.fn() }))
vi.mock('@/lib/upload/image', () => ({
  uploadImage: vi.fn(),
  EMPLOYEE_AVATAR_OPTIONS: {},
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { uploadImage } from '@/lib/upload/image'
import { GET, PATCH } from '@/app/api/mobile/profile/route'

function getRequest() {
  return new Request('http://localhost/api/mobile/profile') as any
}

function patchRequest(form: FormData) {
  return {
    formData: async () => form,
  } as any
}

const AUTH_OK = {
  ok: true,
  user: { id: 'user-1' },
  account: { email: 'employee@example.com' },
  employee: {
    id: 'emp-1',
    firstName: 'Jane',
    lastName: 'Doe',
    employeeId: 'E100',
    avatarUrl: null,
    department: 'Eng',
    jobTitle: 'Dev',
    status: 'ACTIVE',
    phone: '123',
    companyId: 'company-1',
  },
  company: { id: 'company-1', name: 'Acme', logoUrl: null },
}

describe('GET /api/mobile/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.redemption.count as any).mockResolvedValue(3)
    ;(prisma.redemption.findMany as any).mockResolvedValue([{ merchantId: 'm1' }, { merchantId: 'm2' }])
    ;(prisma.employeeAddress.findUnique as any).mockResolvedValue(null)
    ;(prisma.notificationEvent.count as any).mockResolvedValue(5)
  })

  it('returns 401 when unauthenticated', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
    })

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
  })

  it('returns the profile summary with redemption counts and merchant count', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('emp-1')
    expect(body.data.count_of_redemption).toBe(3)
    expect(body.data.count_of_merchant_itredeemed).toBe(2)
    expect(body.data.offerSavedCount).toBe(5)
    expect(body.data.address).toBeNull()
    expect(body.data.company.id).toBe('company-1')
    expect(body.data.account.email).toBe('employee@example.com')
  })
})

describe('PATCH /api/mobile/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.employee.update as any).mockResolvedValue({})
    ;(prisma.employee.findUnique as any).mockResolvedValue({
      id: 'emp-1',
      firstName: 'Janet',
      account: { email: 'employee@example.com' },
      address: null,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
    })

    const form = new FormData()
    form.set('firstName', 'Janet')

    const res = await PATCH(patchRequest(form))

    expect(res.status).toBe(401)
  })

  it('updates personal fields and returns the updated profile', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const form = new FormData()
    form.set('firstName', 'Janet')

    const res = await PATCH(patchRequest(form))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { firstName: 'Janet' },
    })
    expect(body.data.email).toBe('employee@example.com')
  })

  it('returns 400 when firstName is provided but blank', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const form = new FormData()
    form.set('firstName', '   ')

    const res = await PATCH(patchRequest(form))

    expect(res.status).toBe(400)
    expect(prisma.employee.update).not.toHaveBeenCalled()
  })

  it('uploads an avatar file and stores the returned URL', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(uploadImage as any).mockResolvedValue('https://cdn.example.com/avatar.png')

    const form = new FormData()
    const file = new File(['x'], 'avatar.png', { type: 'image/png' })
    form.set('avatar', file)

    const res = await PATCH(patchRequest(form))

    expect(res.status).toBe(200)
    expect(uploadImage).toHaveBeenCalled()
    const [callArgs] = (prisma.employee.update as any).mock.calls[0]
    expect(callArgs.data.avatarUrl).toBe('https://cdn.example.com/avatar.png')
  })
})
