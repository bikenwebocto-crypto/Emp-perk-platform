import { describe, it, expect } from 'vitest'
import {
  cleanText,
  normaliseEmail,
  normaliseInstagram,
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
    ['', null],
  ])('%j → %j', (input, expected) => {
    expect(normaliseInstagram(input)).toBe(expected)
  })
})
