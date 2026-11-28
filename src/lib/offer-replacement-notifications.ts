/**
 * Notification helpers for the offer replacement workflow.
 *
 * Uses the centralized NotificationService for all notification creation.
 */

import { NotificationService } from '@/services/notification.service'
import { createAuditLog } from '@/services/audit-log.service'
import type { NotificationType } from '@/types/notification'

export type ReplacementEvent =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHANGES_REQUESTED'
  | 'ADMIN_PENDING'

interface NotifyArgs {
  event: ReplacementEvent
  newOfferId: string
  currentOfferId: string
  merchantId: string
  reviewNotes?: string
  rejectionReason?: string
}

const EVENT_MAP: Record<ReplacementEvent, { type: NotificationType; title: string; body: string; priority: 'NORMAL' | 'HIGH' | 'URGENT' }> = {
  SUBMITTED: {
    type: 'OFFER_REPLACEMENT_SUBMITTED',
    title: 'Replacement offer submitted',
    body: 'Your replacement offer has been submitted for admin review. Your current live offer will stay visible until the replacement is approved.',
    priority: 'NORMAL',
  },
  APPROVED: {
    type: 'OFFER_REPLACEMENT_APPROVED',
    title: 'Replacement offer approved',
    body: 'Your replacement offer has been approved and is now live. The previous offer has been archived.',
    priority: 'NORMAL',
  },
  REJECTED: {
    type: 'OFFER_REPLACEMENT_REJECTED',
    title: 'Replacement offer rejected',
    body: 'Your replacement offer was rejected. Your previous live offer remains active. See admin notes for details.',
    priority: 'NORMAL',
  },
  CHANGES_REQUESTED: {
    type: 'OFFER_REPLACEMENT_CHANGES_REQUESTED',
    title: 'Changes requested on your replacement offer',
    body: 'An admin has requested changes on your replacement offer. Edit the offer and resubmit when ready.',
    priority: 'HIGH',
  },
  ADMIN_PENDING: {
    type: 'OFFER_REPLACEMENT_ADMIN_PENDING',
    title: 'New offer replacement awaiting review',
    body: 'A merchant has submitted a replacement offer. Open the action queue to review.',
    priority: 'HIGH',
  },
}

export async function notifyReplacement(args: NotifyArgs) {
  const config = EVENT_MAP[args.event]

  if (args.event === 'ADMIN_PENDING') {
    await NotificationService.publishToAdmins({
      type: config.type,
      title: config.title,
      message: config.body,
      priority: config.priority,
      channels: ['IN_APP', 'PUSH'],
      referenceType: 'offer_replacement',
      referenceId: args.newOfferId,
    })
    return
  }

  await NotificationService.publishToMerchant(args.merchantId, {
    type: config.type,
    title: config.title,
    message: config.body,
    priority: config.priority,
    channels: ['IN_APP', 'PUSH'],
    referenceType: 'offer_replacement',
    referenceId: args.newOfferId,
  })
}

/**
 * Audit log entry for a replacement event.
 */
export async function logReplacementAudit(args: {
  event:
    | 'OFFER_REPLACEMENT_CREATED'
    | 'OFFER_REPLACEMENT_APPROVED'
    | 'OFFER_REPLACEMENT_REJECTED'
    | 'OFFER_REPLACEMENT_CHANGES_REQUESTED'
  merchantId: string
  newOfferId: string
  currentOfferId: string
  adminId?: string | null
  reason?: string
  reviewNotes?: string
}, client?: Parameters<typeof createAuditLog>[1]) {
  await createAuditLog({
    actorType: args.adminId ? 'admin' : 'merchant',
    actorId: args.adminId ?? args.merchantId,
    action: args.event,
    entityType: 'merchant_offer',
    entityId: args.newOfferId,
    metadata: {
      currentOfferId: args.currentOfferId,
      newOfferId: args.newOfferId,
      merchantId: args.merchantId,
      reason: args.reason ?? null,
      reviewNotes: args.reviewNotes ?? null,
    } as any,
  }, client)
}
