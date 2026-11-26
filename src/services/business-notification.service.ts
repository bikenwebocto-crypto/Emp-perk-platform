import {
  NotificationService,
  type EmailDeliverySummary,
  type PublishNotificationOptions,
  type Recipient,
} from './notification.service'
import type { NotificationType } from '@/types/notification'
import type { NotificationChannel, NotificationPriority } from '@prisma/client'

export interface BusinessNotificationTemplate {
  type: NotificationType
  title: string
  message: string
  priority: NotificationPriority
}

export const BUSINESS_NOTIFICATION_TEMPLATES = {
  offerSubmitted: (title: string): BusinessNotificationTemplate => ({
    type: 'SYSTEM',
    title: `Offer submitted for approval: ${title}`,
    message: 'A merchant submitted an offer that is waiting for review.',
    priority: 'HIGH',
  }),
  offerApproved: (title: string): BusinessNotificationTemplate => ({
    type: 'OFFER_APPROVED',
    title: `Offer approved: ${title}`,
    message: 'Your offer has been approved and is now live.',
    priority: 'HIGH',
  }),
  offerNowLive: (title: string): BusinessNotificationTemplate => ({
    type: 'NEW_OFFER',
    title: `New offer: ${title}`,
    message: 'A new offer is now available.',
    priority: 'NORMAL',
  }),
  offerUpdated: (title: string): BusinessNotificationTemplate => ({
    type: 'OFFER_UPDATED',
    title: `Offer updated: ${title}`,
    message: 'An offer has been updated.',
    priority: 'NORMAL',
  }),
  offerRejected: (title: string): BusinessNotificationTemplate => ({
    type: 'OFFER_REJECTED',
    title: `Offer rejected: ${title}`,
    message: 'Your offer was rejected. Review the admin feedback for details.',
    priority: 'HIGH',
  }),
  offerValidationFailed: (title: string): BusinessNotificationTemplate => ({
    type: 'SYSTEM',
    title: `Offer validation failed: ${title}`,
    message: 'Your offer could not be submitted. Please review the validation details.',
    priority: 'NORMAL',
  }),
  merchantApproved: (name: string): BusinessNotificationTemplate => ({
    type: 'MERCHANT_APPROVED',
    title: `Merchant approved: ${name}`,
    message: 'The merchant registration has been approved.',
    priority: 'HIGH',
  }),
  companyApproved: (name: string): BusinessNotificationTemplate => ({
    type: 'COMPANY_APPROVED',
    title: `Company approved: ${name}`,
    message: 'The company account has been approved.',
    priority: 'HIGH',
  }),
  redemptionSuccessful: (merchantName: string): BusinessNotificationTemplate => ({
    type: 'OFFER_REDEEMED',
    title: `Successful redemption at ${merchantName}`,
    message: 'An employee successfully redeemed an offer.',
    priority: 'NORMAL',
  }),
  redemptionPending: (merchantName: string): BusinessNotificationTemplate => ({
    type: 'OFFER_REDEEMED',
    title: `New redemption awaiting confirmation at ${merchantName}`,
    message: 'An employee redeemed an offer and it is awaiting your confirmation.',
    priority: 'NORMAL',
  }),
  complaintCreated: (title: string): BusinessNotificationTemplate => ({
    type: 'COMPLAINT_CREATED',
    title: `New complaint: ${title}`,
    message: 'A new complaint requires review.',
    priority: 'HIGH',
  }),
  subscriptionExpired: (companyName: string): BusinessNotificationTemplate => ({
    type: 'BILLING_FAILED',
    title: `Subscription expired: ${companyName}`,
    message: 'The company subscription has expired and requires attention.',
    priority: 'URGENT',
  }),
} as const

/**
 * Outcome of a business notification's email channel. `warning` is a
 * human-readable message for the admin UI when an email was not delivered;
 * it is null when every requested email was sent (or none was requested).
 */
export interface EmailOutcome {
  summary: EmailDeliverySummary | null
  warning: string | null
}

const ROLE_LABEL: Record<Recipient['role'], string> = {
  admin: 'admin',
  merchant: 'merchant',
  company_admin: 'company admin',
  employee: 'employee',
}

export function emailWarningFor(summary: EmailDeliverySummary | null, what: string): string | null {
  if (!summary) return `The ${what} email could not be sent (notification failed). Check the server logs.`
  if (!summary.requested) return null
  if (summary.noRecipients) {
    return `The ${what} email was not sent: no recipient has an active account with email notifications enabled.`
  }
  if (!summary.failed.length) return null
  const details = summary.failed
    .map((f) => `${f.email ?? `${ROLE_LABEL[f.role]} without email`}: ${f.reason}`)
    .join('; ')
  return summary.sent > 0
    ? `The ${what} email reached ${summary.sent} of ${summary.attempted} recipients. Not delivered — ${details}`
    : `The ${what} email was not delivered — ${details}`
}

async function run(
  label: string,
  options: Omit<PublishNotificationOptions, 'recipients'>,
  resolve: () => Promise<Recipient[]>,
): Promise<EmailOutcome> {
  const what = options.title
  try {
    const recipients = await resolve()
    const { email } = await NotificationService.publishDetailed({ ...options, recipients })
    return { summary: email, warning: emailWarningFor(email, what) }
  } catch (error) {
    console.error(`[BusinessNotification] ${label} publish failed`, {
      type: options.type,
      referenceType: options.referenceType,
      referenceId: options.referenceId,
      reason: error instanceof Error ? error.message : String(error),
      error,
    })
    const requested = (options.channels ?? []).includes('EMAIL')
    return { summary: null, warning: requested ? emailWarningFor(null, what) : null }
  }
}

export async function publishBusinessNotification(
  options: Omit<PublishNotificationOptions, 'recipients'> & { recipients: Recipient[] },
): Promise<EmailOutcome> {
  const { recipients, ...rest } = options
  return run('Direct', rest, async () => recipients)
}

export async function publishBusinessToAdmins(
  options: Omit<PublishNotificationOptions, 'recipients'>,
): Promise<EmailOutcome> {
  return run('Admin', options, () => NotificationService.adminRecipients())
}

export async function publishBusinessToCompanyAdmins(
  companyId: string,
  options: Omit<PublishNotificationOptions, 'recipients'>,
): Promise<EmailOutcome> {
  return run('Company-admin', options, () => NotificationService.companyAdminRecipients(companyId))
}

/**
 * Notifies company admins about an admin-driven company status change.
 * First activation is covered by the launch pack email, so it only gets an
 * in-app notice here (avoids the duplicate activation email).
 */
export async function notifyCompanyStatusChange(params: {
  companyId: string
  companyName: string
  previousStatus: string
  status: string
  reason?: string | null
  firstActivation: boolean
}): Promise<EmailOutcome | null> {
  const { companyId, companyName, previousStatus, status, reason, firstActivation } = params
  if (status === previousStatus) return null
  const emailDetail = reason ? `Reason: ${reason}` : null
  const base = {
    referenceType: 'company',
    referenceId: companyId,
    metadata: { previousStatus, status, reason: reason ?? null },
  }

  if (status === 'ACTIVE') {
    if (firstActivation) {
      return publishBusinessToCompanyAdmins(companyId, {
        ...BUSINESS_NOTIFICATION_TEMPLATES.companyApproved(companyName),
        ...base,
        channels: channels('IN_APP', 'PUSH'),
      })
    }
    return publishBusinessToCompanyAdmins(companyId, {
      type: 'COMPANY_APPROVED',
      title: `Company reactivated: ${companyName}`,
      message: 'Your company account is active again. You and your employees can sign in and use offers.',
      priority: 'HIGH',
      ...base,
      channels: channels('IN_APP', 'PUSH', 'EMAIL'),
      actionUrl: '/login',
      actionLabel: 'Sign in',
    })
  }
  if (status === 'PAUSED') {
    return publishBusinessToCompanyAdmins(companyId, {
      type: 'COMPANY_DISABLED',
      title: `Company access paused: ${companyName}`,
      message: 'Your company account has been paused. Employees cannot use offers until it is reactivated. Contact support for details.',
      priority: 'HIGH',
      ...base,
      channels: channels('IN_APP', 'PUSH', 'EMAIL'),
      emailDetail,
    })
  }
  if (status === 'SUSPENDED') {
    return publishBusinessToCompanyAdmins(companyId, {
      type: 'COMPANY_DISABLED',
      title: `Company access suspended: ${companyName}`,
      message: 'Your company account has been suspended. Contact support for details.',
      priority: 'HIGH',
      ...base,
      channels: channels('IN_APP', 'PUSH', 'EMAIL'),
      emailDetail,
    })
  }
  return null
}

/** Collects non-null warnings from several notification outcomes. */
export function collectEmailWarnings(...outcomes: Array<EmailOutcome | null | undefined>): string[] {
  return outcomes.map((o) => o?.warning).filter((w): w is string => Boolean(w))
}

export async function publishBusinessToEmployees(
  companyId: string,
  options: Omit<PublishNotificationOptions, 'recipients'>,
): Promise<void> {
  try {
    await NotificationService.publishToEmployees(companyId, options)
  } catch (error) {
    console.error('[BusinessNotification] Employee publish failed', {
      companyId,
      type: options.type,
      referenceType: options.referenceType,
      referenceId: options.referenceId,
      error,
    })
  }
}

export async function publishBusinessToAllEmployees(
  options: Omit<PublishNotificationOptions, 'recipients'>,
): Promise<void> {
  try {
    await NotificationService.publishToAllEmployees(options)
  } catch (error) {
    console.error('[BusinessNotification] All-employee publish failed', {
      type: options.type,
      referenceType: options.referenceType,
      referenceId: options.referenceId,
      error,
    })
  }
}

export function channels(...channels: NotificationChannel[]): NotificationChannel[] {
  return channels
}
