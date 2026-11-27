import {
  BUSINESS_NOTIFICATION_TEMPLATES,
  channels,
  publishBusinessNotification,
  publishBusinessToAllEmployees,
  type EmailOutcome,
} from '@/services/business-notification.service';
import * as mail from '@/emails/templates/merchant';
import { merchantEmailBase } from '@/lib/merchant-emails';

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

  // Spec M-11 Replacement live / M-07 You are live.
  const base = await merchantEmailBase(merchantId);
  const email = replacedOfferId
    ? mail.m11ReplacementLive({ ...base, newOfferId: offerId, newOfferTitle: title, oldOfferTitle: replacedOfferTitle ?? 'your previous offer' })
    : mail.m07YouAreLive({ ...base, offerId, offerTitle: title, liveDate: new Date() });

  return publishBusinessNotification({
    email,
    type: 'OFFER_APPROVED',
    title: `Offer live: ${title}`,
    message: replacedOfferId
      ? `Your Evergreen offer is now live. Your previous Evergreen offer${
          replacedOfferTitle ? ` "${replacedOfferTitle}"` : ''
        } is now inactive.`
      : 'Your Evergreen offer is now live.',
    priority: 'HIGH',
    recipients: [{ role: 'merchant', id: merchantId }],
    channels: channels('IN_APP', 'PUSH', 'EMAIL'),
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
