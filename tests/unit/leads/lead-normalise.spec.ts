import { describe, it, expect } from 'vitest'
import {
  cleanText,
  consentLabel,
  isTruthyConsent,
  normaliseCyprusPhone,
  normaliseEmail,
  normaliseInstagram,
  normaliseLinkedIn,
  normalisePhone,
  normaliseWebsite,
} from '@/lib/leads/normalise'

describe('cleanText', () => {
  it.each([
    ['  hi  ', 'hi'],
    ['', null],
    ['   ', null],
    [undefined, null],
    [null, null],
    [42, '42'],
  ])('%j → %j', (input, expected) => {
    expect(cleanText(input)).toBe(expected)
  })
})

describe('normaliseEmail', () => {
  it('trims and lowercases', () => {
    expect(normaliseEmail('  Ada@Example.COM ')).toBe('ada@example.com')
  })
  it('returns null for empty', () => {
    expect(normaliseEmail('  ')).toBeNull()
  })
})

describe('normalisePhone', () => {
  it.each([
    ['99 123456', '+35799123456'],
    ['+357 99-123-456', '+35799123456'],
    ['0035799123456', '+35799123456'],
    ['00 44 20 7946 0958', '+442079460958'],
    ['(+44) 20 7946 0958', '+442079460958'],
    ['', null],
    ['   ', null],
    [undefined, null],
    ['---', null],
  ])('%j → %j', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected)
  })
})

describe('normaliseWebsite', () => {
  it.each([
    ['kafeneio.cy', 'https://kafeneio.cy'],
    ['https://kafeneio.cy', 'https://kafeneio.cy'],
    ['http://kafeneio.cy/menu', 'http://kafeneio.cy/menu'],
    ['  www.kafeneio.cy  ', 'https://www.kafeneio.cy'],
    ['', null],
  ])('%j → %j', (input, expected) => {
    expect(normaliseWebsite(input)).toBe(expected)
  })
})

describe('normaliseInstagram', () => {
  it.each([
    ['instagram.com/kafeneio', '@kafeneio'],
    ['https://www.instagram.com/kafeneio/', '@kafeneio'],
    ['https://instagram.com/kafeneio?igsh=abc', '@kafeneio'],
    ['kafeneio', '@kafeneio'],
    ['@kafeneio', '@kafeneio'],
    ['kafeneio/', '@kafeneio'],
    ['', null],
  ])('%j → %j', (input, expected) => {
    expect(normaliseInstagram(input)).toBe(expected)
  })
})

describe('normaliseCyprusPhone', () => {
  it.each([
    ['99123456', '+35799123456'],
    ['99 123456', '+35799123456'],
    ['+357 99 123456', '+35799123456'],
    ['0035799123456', '+35799123456'],
    ['(+357) 99-123-456', '+35799123456'],
    ['', null],
    ['   ', null],
    [undefined, null],
    ['123', null],
    ['+44 20 7946 0958', null],
  ])('%j → %j', (input, expected) => {
    expect(normaliseCyprusPhone(input)).toBe(expected)
  })
})

describe('normaliseLinkedIn', () => {
  it.each([
    ['linkedin.com/in/ada', 'https://www.linkedin.com/in/ada'],
    ['https://linkedin.com/company/navy-labs', 'https://www.linkedin.com/company/navy-labs'],
    ['https://www.linkedin.com/in/ada/', 'https://www.linkedin.com/in/ada'],
    ['https://facebook.com/ada', null],
    ['linkedin.com', null],
    ['', null],
    [undefined, null],
  ])('%j → %j', (input, expected) => {
    expect(normaliseLinkedIn(input)).toBe(expected)
  })
})

describe('isTruthyConsent', () => {
  it.each([true, 'true', 'on', '1', 'I have read the Privacy Policy'])('%j is ticked', (input) => {
    expect(isTruthyConsent(input)).toBe(true)
  })

  it.each([false, 'false', 'off', '0', '', '   ', undefined, null])('%j is not ticked', (input) => {
    expect(isTruthyConsent(input)).toBe(false)
  })
})

describe('consentLabel', () => {
  it('keeps the wording the website sent', () => {
    expect(consentLabel('I have read the Privacy Policy.')).toBe('I have read the Privacy Policy.')
  })

  it('labels a checkbox token as accepted', () => {
    expect(consentLabel('true')).toBe('Accepted')
    expect(consentLabel(true)).toBe('Accepted')
  })
})
