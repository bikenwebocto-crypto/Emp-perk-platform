import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { auditLog: { create: vi.fn() } } }))
vi.mock('next/headers', () => ({ headers: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { headers } from 'next/headers'
import {
  AuditIdentityError,
  REDACTED,
  buildAuditData,
  createAuditLog,
  redactAuditPayload,
  type AuditLogInput,
} from '@/services/audit-log.service'

const db = prisma as any
const mockHeaders = headers as unknown as ReturnType<typeof vi.fn>
const ENTITY = '11111111-1111-4111-8111-111111111111'

function base(overrides: Partial<AuditLogInput> = {}): AuditLogInput {
  return { actorType: 'admin', action: 'TEST', entityType: 'thing', entityId: ENTITY, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.TRUSTED_PROXY_HOPS
})

describe('buildAuditData: actor identity', () => {
  it.each([
    ['admin', 'adminId'],
    ['merchant', 'merchantId'],
    ['company_admin', 'companyAdminId'],
    ['employee', 'employeeId'],
  ] as const)('%s actor is stored in %s with an identity snapshot', (actorType, fk) => {
    const data = buildAuditData(base({ actorType, actorId: 'profile-1' }))
    expect(data[fk]).toBe('profile-1')
    expect(data.actorType).toBe(actorType)
    expect(data.metadata.actor).toEqual({ type: actorType, profileId: 'profile-1' })
  })

  it('an explicit FK wins over actorId', () => {
    const data = buildAuditData(base({ actorType: 'merchant', merchantId: 'm-profile', actorId: 'auth-id' }))
    expect(data.merchantId).toBe('m-profile')
  })

  it.each(['admin', 'merchant', 'company_admin', 'employee'] as const)(
    'a %s actor without an id throws and is never downgraded to system',
    (actorType) => {
      expect(() => buildAuditData(base({ actorType, actorId: null }))).toThrow(AuditIdentityError)
    },
  )

  it('system events carry no actor FK and no snapshot', () => {
    const data = buildAuditData(base({ actorType: 'system' }))
    expect(data.adminId).toBeUndefined()
    expect(data.merchantId).toBeUndefined()
    expect(data.metadata).toBeUndefined()
  })
})

describe('buildAuditData: metadata', () => {
  it('stores companyId, ip, user agent and request id', () => {
    const data = buildAuditData(
      base({
        actorId: 'a1',
        companyId: 'c1',
        metadata: { note: 'hi' },
        request: { ipAddress: '203.0.113.9', userAgent: 'UA/1', requestId: 'req-12345678' },
      }),
    )
    expect(data.companyId).toBe('c1')
    expect(data.ipAddress).toBe('203.0.113.9')
    expect(data.userAgent).toBe('UA/1')
    expect(data.metadata).toMatchObject({ note: 'hi', requestId: 'req-12345678' })
  })

  it('truncates an oversized user agent', () => {
    const data = buildAuditData(base({ actorId: 'a1', request: { userAgent: 'x'.repeat(900) } }))
    expect(data.userAgent).toHaveLength(500)
  })
})

describe('createAuditLog: request context', () => {
  it('reads ip (trusted hop), user agent and request id from the current request', async () => {
    mockHeaders.mockResolvedValue(
      new Headers({
        'x-forwarded-for': '6.6.6.6, 198.51.100.7',
        'user-agent': 'Browser/2',
        'x-request-id': 'abcdef12-3456',
      }),
    )
    await createAuditLog(base({ actorId: 'a1' }))
    const { data } = db.auditLog.create.mock.calls[0][0]
    expect(data.ipAddress).toBe('198.51.100.7') // not the spoofable leftmost entry
    expect(data.userAgent).toBe('Browser/2')
    expect(data.metadata.requestId).toBe('abcdef12-3456')
  })

  it('explicit request values override the ambient request', async () => {
    mockHeaders.mockResolvedValue(new Headers({ 'x-forwarded-for': '198.51.100.7', 'user-agent': 'Ambient' }))
    await createAuditLog(base({ actorId: 'a1', request: { ipAddress: '192.0.2.1', userAgent: 'Explicit' } }))
    const { data } = db.auditLog.create.mock.calls[0][0]
    expect(data.ipAddress).toBe('192.0.2.1')
    expect(data.userAgent).toBe('Explicit')
  })

  it('outside a request scope (workers) context fields are absent', async () => {
    mockHeaders.mockRejectedValue(new Error('headers was called outside a request scope'))
    await createAuditLog(base({ actorType: 'system' }))
    const { data } = db.auditLog.create.mock.calls[0][0]
    expect(data.ipAddress).toBeUndefined()
    expect(data.userAgent).toBeUndefined()
    expect(data.metadata).toBeUndefined()
  })

  it('drops a malformed client-supplied request id', async () => {
    mockHeaders.mockResolvedValue(new Headers({ 'x-request-id': '<script>' }))
    await createAuditLog(base({ actorId: 'a1' }))
    const { data } = db.auditLog.create.mock.calls[0][0]
    expect(data.metadata.requestId).toBeUndefined()
  })

  it('still fails closed for a human actor without an id', async () => {
    mockHeaders.mockResolvedValue(new Headers())
    await expect(createAuditLog(base({ actorType: 'employee' }))).rejects.toBeInstanceOf(AuditIdentityError)
    expect(db.auditLog.create).not.toHaveBeenCalled()
  })
})

describe('redaction', () => {
  it('redacts secrets in nested objects and arrays', () => {
    const out = redactAuditPayload({
      email: 'a@b.co',
      password: 'hunter2',
      newPassword: 'x',
      accessToken: 't',
      refresh_token: 't',
      otp: '123456',
      recoveryCodes: ['aaaa-bbbb', 'cccc-dddd'],
      clientSecret: 's',
      apiKey: 'k',
      nested: { deeper: [{ token: 'z', ok: 1 }] },
    }) as any
    expect(out.email).toBe('a@b.co')
    for (const k of ['password', 'newPassword', 'accessToken', 'refresh_token', 'otp', 'recoveryCodes', 'clientSecret', 'apiKey']) {
      expect(out[k]).toBe(REDACTED)
    }
    expect(out.nested.deeper[0]).toEqual({ token: REDACTED, ok: 1 })
  })

  it('masks redemption / offer codes to their last 4 characters', () => {
    const out = redactAuditPayload({ code: 'ABCD-1234-WXYZ', redemptionCode: 'RC99887766', offerCode: 'OFF1', voucherCode: null }) as any
    expect(out.code).toBe('***WXYZ')
    expect(out.redemptionCode).toBe('***7766')
    expect(out.offerCode).toBe(REDACTED) // too short to keep any part
    expect(out.voucherCode).toBeNull()
  })

  it('leaves non-secret keys untouched and handles cycles', () => {
    const a: any = { bypassReason: 'ok', companyId: 'c', count: 3 }
    a.self = a
    const out = redactAuditPayload(a) as any
    expect(out.bypassReason).toBe('ok')
    expect(out.count).toBe(3)
    expect(out.self).toBe('[CIRCULAR]')
  })

  it('is applied to both changes and metadata on stored rows', () => {
    const data = buildAuditData(
      base({ actorId: 'a1', changes: { password: 'p', name: 'n' }, metadata: { code: 'SECRET-CODE-9999' } }),
    )
    expect(data.changes).toEqual({ password: REDACTED, name: 'n' })
    expect(data.metadata.code).toBe('***9999')
  })
})
