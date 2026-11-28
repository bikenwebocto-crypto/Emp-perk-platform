import { describe, expect, it } from 'vitest'
import { formatBranchAddress, formatBranchName } from './format'

describe('branch display formatting', () => {
  it('formats nested addresses with every available part', () => {
    expect(formatBranchAddress({
      address: {
        line1: '12 Harbour Road',
        line2: 'Suite 4',
        city: 'Limassol',
        state: 'Limassol District',
        postalCode: '3042',
        country: 'Cyprus',
      },
    })).toBe('12 Harbour Road, Suite 4, 3042 Limassol, Limassol District, Cyprus')
  })

  it('formats flat offer-review addresses and never stringifies object values', () => {
    expect(formatBranchAddress({
      addressLine1: '12 Harbour Road',
      addressLine2: null,
      city: 'Limassol',
      state: null,
      postalCode: '3042',
      country: 'Cyprus',
    })).toBe('12 Harbour Road, 3042 Limassol, Cyprus')
    expect(formatBranchAddress({
      id: 'branch-uuid',
      address: { line1: { value: 'not display text' }, city: {} },
    })).toBe('No address on file')
  })

  it('prefers a branch name and never falls back to its ID', () => {
    expect(formatBranchName({ name: 'Old Port', id: 'branch-uuid' })).toBe('Old Port')
    expect(formatBranchName({ name: {}, id: 'branch-uuid' })).toBe('Branch')
    expect(formatBranchName({ id: 'branch-uuid' })).toBe('Branch')
  })
})
