import { NotificationService, type PublishNotificationOptions, type Recipient } from './notification.service'
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

export async function publishBusinessNotification(
  options: Omit<PublishNotificationOptions, 'recipients'> & { recipients: Recipient[] },
): Promise<void> {
  try {
    await NotificationService.publish(options)
  } catch (error) {
    console.error('[BusinessNotification] Publish failed', {
      type: options.type,
      referenceType: options.referenceType,
      referenceId: options.referenceId,
      recipientCount: options.recipients.length,
      error,
    })
  }
}

export async function publishBusinessToAdmins(
  options: Omit<PublishNotificationOptions, 'recipients'>,
): Promise<void> {
  try {
    await NotificationService.publishToAdmins(options)
  } catch (error) {
    console.error('[BusinessNotification] Admin publish failed', {
      type: options.type,
      referenceType: options.referenceType,
      referenceId: options.referenceId,
      error,
    })
  }
}

export async function publishBusinessToCompanyAdmins(
  companyId: string,
  options: Omit<PublishNotificationOptions, 'recipients'>,
): Promise<void> {
  try {
    await NotificationService.publishToCompanyAdmins(companyId, options)
  } catch (error) {
    console.error('[BusinessNotification] Company-admin publish failed', {
      companyId,
      type: options.type,
      referenceType: options.referenceType,
      referenceId: options.referenceId,
      error,
    })
  }
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
