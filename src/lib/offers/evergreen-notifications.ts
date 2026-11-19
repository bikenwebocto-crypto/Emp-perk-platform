import {
  BUSINESS_NOTIFICATION_TEMPLATES,
  channels,
  publishBusinessNotification,
  publishBusinessToAllEmployees,
} from '@/services/business-notification.service';

/**
 * Notifications for an Evergreen offer that went LIVE without admin approval:
 *  - merchant: confirmation (and, if it took over, that the old one is inactive)
 *  - all users: "New offer" broadcast — same event the admin approval path sends
 * Each publish swallows its own errors, so one failure never blocks the other.
 */
export async function notifyEvergreenLive(params: {
  offerId: string;
  title: string;
  merchantId: string;
  replacedOfferId?: string | null;
  replacedOfferTitle?: string | null;
}): Promise<void> {
  const { offerId, title, merchantId, replacedOfferId = null, replacedOfferTitle = null } = params;

  await publishBusinessNotification({
    type: 'OFFER_APPROVED',
    title: `Offer live: ${title}`,
    message: replacedOfferId
      ? `Your Evergreen offer is now live. Your previous Evergreen offer${
          replacedOfferTitle ? ` "${replacedOfferTitle}"` : ''
        } is now inactive.`
      : 'Your Evergreen offer is now live.',
    priority: 'HIGH',
    recipients: [{ role: 'merchant', id: merchantId }],
    channels: channels('IN_APP', 'PUSH'),
    referenceType: 'merchant_offer',
    referenceId: offerId,
    metadata: { autoActivated: true, replacedOfferId },
  });

  // Event: New Offer Published — broadcast to all active users.
  // Individual users can opt out via notification preferences.
  await publishBusinessToAllEmployees({
    ...BUSINESS_NOTIFICATION_TEMPLATES.offerNowLive(title),
    channels: channels('IN_APP', 'PUSH'),
    referenceType: 'merchant_offer',
    referenceId: offerId,
    metadata: { merchantId, autoActivated: true },
  });
}
