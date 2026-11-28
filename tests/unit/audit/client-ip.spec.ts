import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { clientIpFromRequest, clientIpOrNull, trustedProxyHops } from '@/lib/rate-limit'

const req = (h: Record<string, string>) => ({ headers: new Headers(h) })

describe('trusted-proxy client IP', () => {
  beforeEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS
  })
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS
  })

  it('defaults to one trusted hop', () => {
    expect(trustedProxyHops()).toBe(1)
    process.env.TRUSTED_PROXY_HOPS = 'garbage'
    expect(trustedProxyHops()).toBe(1)
  })

  it('ignores a spoofed leftmost x-forwarded-for entry (1 hop)', () => {
    expect(clientIpOrNull(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.5' }))).toBe('203.0.113.5')
  })

  it('takes the Nth entry from the right with 2 hops', () => {
    process.env.TRUSTED_PROXY_HOPS = '2'
    expect(clientIpOrNull(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.5, 10.0.0.2' }))).toBe('203.0.113.5')
  })

  it('returns null when the chain is shorter than the hop count', () => {
    process.env.TRUSTED_PROXY_HOPS = '3'
    expect(clientIpOrNull(req({ 'x-forwarded-for': '203.0.113.5' }))).toBeNull()
  })

  it('ignores all forwarded headers with 0 hops', () => {
    process.env.TRUSTED_PROXY_HOPS = '0'
    expect(clientIpOrNull(req({ 'x-forwarded-for': '203.0.113.5', 'x-real-ip': '203.0.113.6' }))).toBeNull()
    expect(clientIpFromRequest(req({ 'x-real-ip': '203.0.113.6' }))).toBe('unknown')
  })

  it('rejects values that are not IP addresses', () => {
    expect(clientIpOrNull(req({ 'x-forwarded-for': "'; DROP TABLE x; --" }))).toBeNull()
    expect(clientIpOrNull(req({ 'x-real-ip': 'not-an-ip' }))).toBeNull()
  })

  it('accepts IPv6 and falls back to x-real-ip', () => {
    expect(clientIpOrNull(req({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1')
    expect(clientIpOrNull(req({ 'x-real-ip': '198.51.100.1' }))).toBe('198.51.100.1')
  })
})
