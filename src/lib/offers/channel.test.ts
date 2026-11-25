import { describe, it, expect } from 'vitest'
import {
  BRANCHES_REQUIRED_MESSAGE,
  branchSelectionError,
  branchSelectionFromConfig,
  channelFromRedemption,
  channelRedemptionType,
  parseBranchSelection,
  withBranchSelection,
} from './channel'

describe('channel → redemptionType', () => {
  it('keeps the values the mobile app understands', () => {
    expect(channelRedemptionType('IN_STORE')).toBe('VIRTUAL_CARD_AUTO_VERIFY')
    expect(channelRedemptionType('ONLINE')).toBe('ONLINE_CODE')
    expect(channelRedemptionType('BOTH')).toBe('ONLINE_CODE')
  })

  it('reads a stored channel, or derives it for older offers', () => {
    expect(channelFromRedemption('ONLINE_CODE', { channel: 'BOTH' })).toBe('BOTH')
    expect(channelFromRedemption('VIRTUAL_CARD_AUTO_VERIFY', null)).toBe('IN_STORE')
    expect(channelFromRedemption('ONLINE_CODE', {})).toBe('ONLINE')
  })
})

describe('parseBranchSelection', () => {
  it('leaves stored values alone when no channel is sent', () => {
    expect(parseBranchSelection({})).toEqual({ ok: true, value: undefined })
  })

  it('rejects an unknown channel or bad ids', () => {
    expect(parseBranchSelection({ channel: 'PHONE' }).ok).toBe(false)
    expect(parseBranchSelection({ channel: 'BOTH', branchIds: [1] }).ok).toBe(false)
  })

  it('online offers never carry branches', () => {
    expect(parseBranchSelection({ channel: 'ONLINE', allBranches: false, branchIds: ['a'] })).toEqual({
      ok: true,
      value: { channel: 'ONLINE', allBranches: false, branchIds: [] },
    })
  })

  it('all branches drops chosen ids; choose keeps unique ids', () => {
    expect(parseBranchSelection({ channel: 'BOTH', allBranches: true, branchIds: ['a'] })).toEqual({
      ok: true,
      value: { channel: 'BOTH', allBranches: true, branchIds: [] },
    })
    expect(parseBranchSelection({ channel: 'IN_STORE', allBranches: false, branchIds: ['a', 'a', 'b'] })).toEqual({
      ok: true,
      value: { channel: 'IN_STORE', allBranches: false, branchIds: ['a', 'b'] },
    })
  })
})

describe('branchSelectionError', () => {
  it('Both with no branch chosen → "Choose all branches or at least one"', () => {
    expect(branchSelectionError({ channel: 'BOTH', allBranches: false, branchIds: [] })).toBe(
      BRANCHES_REQUIRED_MESSAGE,
    )
  })

  it('passes for all branches, chosen branches, or online', () => {
    expect(branchSelectionError({ channel: 'BOTH', allBranches: true, branchIds: [] })).toBeNull()
    expect(branchSelectionError({ channel: 'IN_STORE', allBranches: false, branchIds: ['a'] })).toBeNull()
    expect(branchSelectionError({ channel: 'ONLINE', allBranches: false, branchIds: [] })).toBeNull()
  })
})

describe('stored configuration', () => {
  it('round-trips and keeps other config keys', () => {
    const cfg = withBranchSelection(
      { code: 'SAVE10', repeatAfterHours: 24 },
      { channel: 'BOTH', allBranches: false, branchIds: ['a'] },
    )
    expect(cfg).toMatchObject({ code: 'SAVE10', repeatAfterHours: 24 })
    expect(branchSelectionFromConfig('ONLINE_CODE', cfg)).toEqual({
      channel: 'BOTH',
      allBranches: false,
      branchIds: ['a'],
    })
  })

  it('older offers default to all branches', () => {
    expect(branchSelectionFromConfig('VIRTUAL_CARD_AUTO_VERIFY', { code: 'X' })).toEqual({
      channel: 'IN_STORE',
      allBranches: true,
      branchIds: [],
    })
  })
})

import { missingBranchTypes, missingBranchesMessage } from "./channel";

describe("required branches per channel", () => {
  const none = { inStore: 0, online: 0 };
  it("In-store needs an in-store branch only", () => {
    expect(missingBranchTypes("IN_STORE", none)).toEqual(["IN_STORE"]);
    expect(missingBranchTypes("IN_STORE", { inStore: 1, online: 0 })).toEqual([]);
  });
  it("Online needs an online branch only", () => {
    expect(missingBranchTypes("ONLINE", { inStore: 1, online: 0 })).toEqual(["ONLINE"]);
    expect(missingBranchTypes("ONLINE", { inStore: 0, online: 1 })).toEqual([]);
  });
  it("Both needs one of each", () => {
    expect(missingBranchTypes("BOTH", none)).toEqual(["IN_STORE", "ONLINE"]);
    expect(missingBranchTypes("BOTH", { inStore: 1, online: 0 })).toEqual(["ONLINE"]);
    expect(missingBranchTypes("BOTH", { inStore: 1, online: 1 })).toEqual([]);
    expect(missingBranchesMessage("BOTH", none)).toMatch(/In-store branch and an active Online branch/);
    expect(missingBranchesMessage("BOTH", { inStore: 1, online: 1 })).toBeNull();
  });
});
