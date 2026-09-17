import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn(() => ({})) }))
vi.mock('@/lib/upload/image', () => ({
  uploadImage: vi.fn(),
  TICKET_EVIDENCE_OPTIONS: { bucket: 'evidence', folder: 'tickets' },
}))

import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { uploadImage } from '@/lib/upload/image'
import { POST } from '@/app/api/mobile/tickets/upload/route'

function postRequest(form: FormData) {
  return { formData: async () => form } as any
}

const AUTH_OK = {
  ok: true,
  user: { id: 'user-1' },
  account: { id: 'acc-1' },
  employee: { id: 'emp-1', companyId: 'company-1' },
  company: { id: 'company-1' },
}

describe('POST /api/mobile/tickets/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
    })

    const form = new FormData()
    form.set('file', new File(['x'], 'evidence.png', { type: 'image/png' }))

    const res = await POST(postRequest(form))

    expect(res.status).toBe(401)
  })

  it('returns 400 when no file is provided', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const res = await POST(postRequest(new FormData()))

    expect(res.status).toBe(400)
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('returns 400 for an unsupported file type', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const form = new FormData()
    form.set('file', new File(['x'], 'evidence.txt', { type: 'text/plain' }))

    const res = await POST(postRequest(form))

    expect(res.status).toBe(400)
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('uploads a valid image and returns its public URL', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(uploadImage as any).mockResolvedValue('https://cdn.example.com/tickets/evidence.png')

    const form = new FormData()
    form.set('file', new File(['x'], 'evidence.png', { type: 'image/png' }))

    const res = await POST(postRequest(form))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.url).toBe('https://cdn.example.com/tickets/evidence.png')
    expect(uploadImage).toHaveBeenCalled()
  })
})
