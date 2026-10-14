/**
 * Offer Expiry Scheduler
 *
 * Runs roughly every hour (gated by the queue worker's polling loop) and:
 *  - Expires LIVE offers whose endDate has passed and notifies the
 *    employees who saved them with OFFER_EXPIRED (recently expired only,
 *    to avoid back-fill noise).
 *  - Notifies employees who saved an offer expiring today (OFFER_EXPIRING).
 *  - Notifies employees who saved an offer expiring within 24h (OFFER_EXPIRING).
 *
 * Idempotency:
 *  - Expired offers are transitioned with `status: 'LIVE'` guards; only the
 *    run whose update actually changed the row sends OFFER_EXPIRED, so a
 *    concurrent or repeated run never re-notifies.
 *  - Every notice skips employees who already have a row with the same
 *    type + title + offer reference (see notifySavedEmployees).
 *  - Audiences are scoped to employees who saved the offer (the `saved_offer`
 *    side channel), keeping volume bounded.
 */

import { prisma } from '@/lib/prisma';
import { NotificationService } from '@/services/notification.service';
import type { Recipient } from '@/services/notification.service';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface OfferForNotify {
  id: string;
  title: string;
  endDate: Date;
}

class OfferExpiryScheduler {
  private lastRunAt = 0;
  private running = false;

  shouldRun(): boolean {
    return Date.now() - this.lastRunAt >= HOUR_MS;
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.lastRunAt = Date.now();

    try {
      await this.processExpiredOffers();
      await this.processExpiringTodayOffers();
      await this.processExpiringSoonOffers();
    } catch (error) {
      console.error('[OfferExpiryScheduler] Failed:', error);
    } finally {
      this.running = false;
    }
  }

  private async processExpiredOffers(): Promise<void> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - DAY_MS);

    const offers = await prisma.merchantOffer.findMany({
      where: { status: 'LIVE', deletedAt: null, endDate: { lt: now } },
      select: { id: true, title: true, endDate: true },
    });
    if (!offers.length) return;

    // Transition to EXPIRED. The status guard makes this idempotent, and its
    // row count tells us whether THIS run made the change — a concurrent run
    // (cron + request-triggered) gets count 0 and must not notify again.
    const transitioned: OfferForNotify[] = [];
    for (const offer of offers) {
      const { count } = await prisma.merchantOffer.updateMany({
        where: { id: offer.id, status: 'LIVE' },
        data: { status: 'EXPIRED', expiresAt: offer.endDate },
      });
      if (count === 1) transitioned.push(offer);
    }

    // Notify only offers this run expired, and only if they expired within
    // the last 24 hours.
    const recent = transitioned.filter((offer) => offer.endDate >= cutoff);
    for (const offer of recent) {
      await this.notifySavedEmployees(
        offer,
        'OFFER_EXPIRED',
        'Offer expired',
        `"${offer.title}" has expired and is no longer available.`
      );
    }
  }

  private async processExpiringTodayOffers(): Promise<void> {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startTomorrow = new Date(startToday.getTime() + DAY_MS);

    const offers = await prisma.merchantOffer.findMany({
      where: {
        status: 'LIVE',
        deletedAt: null,
        endDate: { gte: startToday, lt: startTomorrow },
      },
      select: { id: true, title: true, endDate: true },
    });

    for (const offer of offers) {
      await this.notifySavedEmployees(
        offer,
        'OFFER_EXPIRING',
        'Offer expiring today',
        `"${offer.title}" expires today.`
      );
    }
  }

  private async processExpiringSoonOffers(): Promise<void> {
    const now = new Date();
    const soonEnd = new Date(now.getTime() + DAY_MS);
    // Exclude offers expiring today (handled by processExpiringTodayOffers)
    // so an offer never receives two expiring notices.
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const offers = await prisma.merchantOffer.findMany({
      where: { status: 'LIVE', deletedAt: null, endDate: { gt: now, lt: soonEnd } },
      select: { id: true, title: true, endDate: true },
    });

    for (const offer of offers) {
      if (offer.endDate >= startToday) continue;
      await this.notifySavedEmployees(
        offer,
        'OFFER_EXPIRING',
        'Offer expiring soon',
        `"${offer.title}" expires in less than 24 hours.`
      );
    }
  }

  /**
   * Notify the employees who saved this offer. Uses the saved_offer side
   * channel as the audience source so expiry notices stay relevant and
   * bounded instead of broadcasting to every active employee.
   */
  private async notifySavedEmployees(
    offer: OfferForNotify,
    type: 'OFFER_EXPIRING' | 'OFFER_EXPIRED',
    title: string,
    message: string
  ): Promise<void> {
    const savers = await prisma.notificationEvent.findMany({
      where: { referenceType: 'saved_offer', referenceId: offer.id },
      select: { employeeId: true },
      distinct: ['employeeId'],
    });
    const saverIds = savers
      .map((row) => row.employeeId)
      .filter((id): id is string => Boolean(id));
    if (!saverIds.length) return;

    // Skip employees who already got this exact notice. NotificationEvent has
    // no unique key, so createMany's skipDuplicates does not dedupe — without
    // this, every run (hourly cron + request-triggered) would resend it.
    const alreadyNotified = await prisma.notificationEvent.findMany({
      where: {
        type,
        title,
        referenceType: 'offer',
        referenceId: offer.id,
        employeeId: { in: saverIds },
      },
      select: { employeeId: true },
    });
    const notifiedIds = new Set(alreadyNotified.map((row) => row.employeeId));
    const recipients: Recipient[] = saverIds
      .filter((id) => !notifiedIds.has(id))
      .map((id) => ({ role: 'employee' as const, id }));
    if (!recipients.length) return;

    await NotificationService.publish({
      type,
      title,
      message,
      recipients,
      referenceType: 'offer',
      referenceId: offer.id,
      channels: ['IN_APP', 'PUSH'],
    });
  }
}

export { OfferExpiryScheduler };
