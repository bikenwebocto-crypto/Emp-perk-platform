import {
  BUSINESS_NOTIFICATION_TEMPLATES,
  channels,
  publishBusinessNotification,
  publishBusinessToAllEmployees,
  type EmailOutcome,
} from '@/services/business-notification.service';

/**
 * Merchant notice for an Evergreen offer that went LIVE without admin approval
 * (and, if it took over, that the old one is inactive). The first go-live is
 * also emailed. Awaited by the route so an email failure can be shown to the
 * merchant via `emailWarnings`. Never throws.
 */
export async function notifyEvergreenMerchant(params: {
  offerId: string;
  title: string;
  merchantId: string;
  replacedOfferId?: string | null;
  replacedOfferTitle?: string | null;
}): Promise<EmailOutcome> {
  const { offerId, title, merchantId, replacedOfferId = null, replacedOfferTitle = null } = params;

  return publishBusinessNotification({
    type: 'OFFER_APPROVED',
    title: `Offer live: ${title}`,
    message: replacedOfferId
      ? `Your Evergreen offer is now live. Your previous Evergreen offer${
          replacedOfferTitle ? ` "${replacedOfferTitle}"` : ''
        } is now inactive.`
      : 'Your Evergreen offer is now live.',
    priority: 'HIGH',
    recipients: [{ role: 'merchant', id: merchantId }],
    // Email only on the first go-live; a replacement keeps in-app + push.
    channels: replacedOfferId ? channels('IN_APP', 'PUSH') : channels('IN_APP', 'PUSH', 'EMAIL'),
    referenceType: 'merchant_offer',
    referenceId: offerId,
    metadata: { autoActivated: true, replacedOfferId },
    actionUrl: `/merchant/offers/${offerId}`,
    actionLabel: 'View offer',
  });
}

/**
 * Event: New Offer Published — broadcast to all active users (same event the
 * admin approval path sends). Runs after the response; swallows its errors.
 */
export async function notifyEvergreenBroadcast(params: {
  offerId: string;
  title: string;
  merchantId: string;
}): Promise<void> {
  const { offerId, title, merchantId } = params;
  await publishBusinessToAllEmployees({
    ...BUSINESS_NOTIFICATION_TEMPLATES.offerNowLive(title),
    channels: channels('IN_APP', 'PUSH'),
    referenceType: 'merchant_offer',
    referenceId: offerId,
    metadata: { merchantId, autoActivated: true },
  });
}
