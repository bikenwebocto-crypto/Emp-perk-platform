import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { coverageFromRedemption, isBranchCovered } from './visible-merchants'
import {
  evergreenBranchLinkMessage,
  evergreenCoverageApprovalMessage,
  evergreenCoverageMessage,
} from './channel'

const store = (id: string) => ({ id, branchType: 'IN_STORE' })

describe('Evergreen branch coverage (one-perk rule)', () => {
  it('All branches covers every physical branch', () => {
    const cov = coverageFromRedemption('o1', {
      redemptionType: 'VIRTUAL_CARD_AUTO_VERIFY',
      configuration: { channel: 'IN_STORE', allBranches: true, branchIds: [] },
    })
    expect(isBranchCovered(cov, store('a'))).toBe(true)
    expect(isBranchCovered(cov, { id: 'b', branchType: 'BOTH' })).toBe(true)
  })

  it('chosen branches cover only those branches', () => {
    const cov = coverageFromRedemption('o1', {
      redemptionType: 'VIRTUAL_CARD_AUTO_VERIFY',
      configuration: { channel: 'IN_STORE', allBranches: false, branchIds: ['a'] },
    })
    expect(isBranchCovered(cov, store('a'))).toBe(true)
    expect(isBranchCovered(cov, store('b'))).toBe(false)
  })

  it('online-type branches are covered by any live Evergreen', () => {
    const cov = coverageFromRedemption('o1', {
      redemptionType: 'VIRTUAL_CARD_AUTO_VERIFY',
      configuration: { channel: 'IN_STORE', allBranches: false, branchIds: ['a'] },
    })
    expect(isBranchCovered(cov, { id: 'web', branchType: 'ONLINE' })).toBe(true)
  })

  it('an Online-only Evergreen covers no physical branch', () => {
    const cov = coverageFromRedemption('o1', {
      redemptionType: 'ONLINE_CODE',
      configuration: { channel: 'ONLINE' },
    })
    expect(isBranchCovered(cov, store('a'))).toBe(false)
  })

  it('legacy Evergreen with no redemption row covers all branches', () => {
    expect(isBranchCovered(coverageFromRedemption('o1', null), store('a'))).toBe(true)
  })

  it('no live Evergreen covers nothing', () => {
    expect(isBranchCovered(null, store('a'))).toBe(false)
    expect(isBranchCovered(undefined, { id: 'web', branchType: 'ONLINE' })).toBe(false)
  })

  it('messages name the uncovered branches and the fix', () => {
    expect(evergreenCoverageMessage(['Mall', 'Airport'], 'IN_STORE')).toContain('Not covered: Mall, Airport')
    expect(evergreenCoverageMessage(['Mall'], 'ONLINE')).toContain('Choose In-store or Both')
    expect(evergreenCoverageApprovalMessage(['Mall'])).toContain("can't be approved")
    expect(evergreenBranchLinkMessage('Summer 10%')).toContain('Link it to "Summer 10%" now')
    const many = evergreenCoverageMessage(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'IN_STORE')
    expect(many).toContain('and 2 more')
  })
})
