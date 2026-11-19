// Helper functions for encoding/decoding redemption status
// because the Redemption model does not have a dedicated status field.
// Status is encoded in isVerified + merchantNotes/employeeNotes prefixes.

import { prisma } from '@/lib/prisma'

export type RedemptionStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'REDEEMED'
export type RedemptionMethod = 'IN_STORE' | 'ONLINE' | 'QR_CODE' | 'MANUAL_CODE'

const METHOD_PREFIX = 'METHOD:'
const REJECTED_PREFIX = 'REJECTED:'
const CANCELLED_PREFIX = 'CANCELLED:'

export function encodeMethod(method: RedemptionMethod): string {
  return `${METHOD_PREFIX}${method}`
}

export function decodeMethod(merchantNotes: string | null | undefined): RedemptionMethod | null {
  if (!merchantNotes) return null
  const m = merchantNotes.match(/^METHOD:(\w+)/)
  return (m?.[1] as RedemptionMethod) ?? null
}

export function deriveStatus(redemption: {
  isVerified: boolean
  verifiedAt: Date | null
  merchantNotes: string | null
  employeeNotes: string | null
}): RedemptionStatus {
  if (redemption.employeeNotes?.startsWith(CANCELLED_PREFIX)) return 'CANCELLED'
  if (redemption.merchantNotes?.startsWith(REJECTED_PREFIX)) return 'REJECTED'
  if (redemption.isVerified && redemption.verifiedAt) return 'CONFIRMED'
  return 'PENDING'
}

/**
 * Prisma `where` fragment that matches exactly the rows `deriveStatus` maps to `status`.
 * Status is derived from notes/verification, so it can't be filtered on a column directly.
 * Null-safe: `NOT startsWith` alone would drop rows whose notes are NULL.
 */
export function statusWhere(status: string): Record<string, unknown> | null {
  const notCancelled = { OR: [{ employeeNotes: null }, { NOT: { employeeNotes: { startsWith: CANCELLED_PREFIX } } }] }
  const notRejected = { OR: [{ merchantNotes: null }, { NOT: { merchantNotes: { startsWith: REJECTED_PREFIX } } }] }
  switch (status) {
    case 'CANCELLED':
      return { employeeNotes: { startsWith: CANCELLED_PREFIX } }
    case 'REJECTED':
      return { AND: [notCancelled, { merchantNotes: { startsWith: REJECTED_PREFIX } }] }
    case 'CONFIRMED':
      return { AND: [notCancelled, notRejected, { isVerified: true }, { verifiedAt: { not: null } }] }
    case 'PENDING':
      return { AND: [notCancelled, notRejected, { OR: [{ isVerified: false }, { verifiedAt: null }] }] }
    default:
      return null
  }
}

export function rejectedNote(reason: string): string {
  return `${REJECTED_PREFIX}${reason}`
}

export function cancelledNote(reason: string): string {
  return `${CANCELLED_PREFIX}${reason}`
}

export const REDEMPTION_STATUSES: RedemptionStatus[] = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REDEEMED']
export const REDEMPTION_METHODS: RedemptionMethod[] = ['IN_STORE', 'ONLINE', 'QR_CODE', 'MANUAL_CODE']

export const STATUS_LABELS: Record<RedemptionStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REDEEMED: 'Redeemed',
}

export const METHOD_LABELS: Record<RedemptionMethod, string> = {
  IN_STORE: 'In-Store',
  ONLINE: 'Online',
  QR_CODE: 'QR Code',
  MANUAL_CODE: 'Manual Code',
}
