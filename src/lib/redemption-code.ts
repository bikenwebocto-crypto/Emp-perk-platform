import { customAlphabet } from 'nanoid'

// Excludes ambiguous chars: 0, O, 1, I, L — merchants read this code off
// an employee's phone screen, so keep it short and unambiguous.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const generate = customAlphabet(ALPHABET, 8)

/**
 * Generate a unique per-redemption code (8 chars, ~32-char alphabet ≈ 1
 * trillion combinations). This is a proof-of-redemption identifier owned
 * by a single Redemption row — NOT a copy of the offer's shared config
 * code. Stored in Redemption.redemptionCode and shown to the employee
 * after they redeem; the merchant verifies them against it.
 */
export function generateRedemptionCode(): string {
  return generate()
}
