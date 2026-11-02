import { customAlphabet } from 'nanoid'

// Unambiguous alphabet: a visitor may read this reference back to us, so it
// excludes 0/O and 1/I/L. 32^10 ≈ 1.1e15 combinations.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const generate = customAlphabet(ALPHABET, 10)

const PREFIX = 'DEMO-'

/**
 * Public submission reference for a demo booking, returned to the visitor.
 * Deliberately not the row id: the endpoint must not leak database identifiers.
 */
export function generateDemoBookingReference(): string {
  return `${PREFIX}${generate()}`
}
