import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedMobileEmployee } from "@/lib/mobile-auth";
import { checkRedemptionEligibility } from "@/lib/offer-visibility";
import {
  claimAttempt,
  linkAttemptToRedemption,
  ensureCapacityRow,
  reserveCapacity,
  AlreadyRedeemedError,
  OfferLimitReachedError,
} from "@/lib/redemption-tracking";
import { generateRedemptionCode } from "@/lib/redemption-code";
import { encodeMethod } from "@/lib/redemption-status";
import { VIRTUAL_CARD_AUTO_VERIFY } from "@/lib/virtual-card";
import { createAuditLog } from "@/services/audit-log.service";
import {
  BUSINESS_NOTIFICATION_TEMPLATES,
  channels,
  publishBusinessNotification,
} from "@/services/business-notification.service";

const MAX_CODE_LENGTH = 32;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const REJECTION_REASON = "Merchant declined";

function fail(message, code = "VALIDATION", status = 400) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

// Day of week in Cyprus time (the server runs in UTC)
function cyprusDayOfWeek(date) {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Nicosia",
    weekday: "short",
  }).format(date);
  return WEEKDAYS.indexOf(wd);
}

export async function POST(request, { params }) {
  try {
    // ── 1. Authenticate ─────────────────────────────────────────
    const auth = await getAuthenticatedMobileEmployee(request);
    if (!auth.ok) return auth.response;
    const employee = auth.employee;

    const { id: offerId } = await params;
    if (!offerId) return fail("Offer id is required");

    const body = await request.json().catch(() => ({}));
    const enteredCode =
      typeof body?.offerCode === "string" ? body.offerCode.trim() : "";
    if (!enteredCode) return fail("Offer code is required", "CODE_REQUIRED");
    if (enteredCode.length > MAX_CODE_LENGTH)
      return fail("Invalid offer code", "INVALID_CODE");

    // ── 2. Offer exists and is valid ────────────────────────────
    const offer = await prisma.merchantOffer.findFirst({
      where: { id: offerId, deletedAt: null },
      include: {
        merchant: {
          select: { id: true, businessName: true, status: true, deletedAt: true },
        },
        pricing: { select: { configuration: true } },
        redemption: {
          select: {
            redemptionType: true,
            configuration: true,
            maxRedemptions: true,
            daysOfWeek: true,
          },
        },
      },
    });
    if (!offer) return fail("Offer not found", "NOT_FOUND", 404);

    const now = new Date();
    if (offer.status !== "LIVE" || offer.startDate > now || offer.endDate <= now) {
      return fail("This offer is no longer available.", "OFFER_UNAVAILABLE");
    }
    if (offer.merchant.status !== "ACTIVE" || offer.merchant.deletedAt) {
      return fail("This offer is no longer available.", "OFFER_UNAVAILABLE");
    }

    // ── 3. Correct redemption type ──────────────────────────────
    if (offer.redemption?.redemptionType !== VIRTUAL_CARD_AUTO_VERIFY) {
      return fail(
        "This offer does not support auto redemption.",
        "WRONG_REDEMPTION_TYPE",
      );
    }

    const days = offer.redemption.daysOfWeek;
    if (Array.isArray(days) && days.length > 0 && !days.includes(cyprusDayOfWeek(now))) {
      return fail("This offer is not available today.", "NOT_AVAILABLE_TODAY");
    }

    // ── 4. Employee eligibility (company access, per-user limit) ─
    const eligibility = await checkRedemptionEligibility(offerId, employee.id);
    if (!eligibility.eligible) {
      return fail(
        eligibility.reason ?? "Not eligible to redeem this offer",
        "NOT_ELIGIBLE",
      );
    }

    // ── 5. Validate offer code ──────────────────────────────────
    const redemptionConfig = offer.redemption.configuration ?? {};
    const expectedCode = String(redemptionConfig.code ?? "").trim();
    if (!expectedCode) {
      return fail("This offer has no code configured.", "CODE_NOT_CONFIGURED");
    }
    if (enteredCode.toUpperCase() !== expectedCode.toUpperCase()) {
      void createAuditLog({
        actorType: "employee",
        actorId: employee.id,
        action: "AUTO_REJECT_INVALID_CODE",
        entityType: "MERCHANT_OFFER",
        entityId: offer.id,
        metadata: { merchantId: offer.merchantId, loginSource: "mobile" },
      }).catch(() => {});
      return fail("Invalid offer code", "INVALID_CODE");
    }

    // ── Savings ─────────────────────────────────────────────────
    const pricingConfig = offer.pricing?.configuration ?? {};
    const isPercentage = String(offer.offerType).toLowerCase() === "percentage";
    const discountAmount = Number(pricingConfig.amount ?? pricingConfig.percent ?? 0);
    const savings = isPercentage ? 0 : discountAmount; // percentage needs bill amount

    // ── 6. Claim + capacity + create REJECTED (atomic) ──────────
    let redemption;
    try {
      redemption = await prisma.$transaction(
        async (tx) => {
          // Claim stays, so the employee can't try to redeem again
          const claim = await claimAttempt(tx, offer.id, employee.id);
          if (!claim.ok) throw new AlreadyRedeemedError();

          await ensureCapacityRow(tx, offer.id, offer.redemption.maxRedemptions ?? null);
          const reserve = await reserveCapacity(tx, offer.id);
          if (!reserve.ok) throw new OfferLimitReachedError();

          const r = await tx.redemption.create({
            data: {
              merchantId: offer.merchantId,
              offerId: offer.id,
              employeeId: employee.id,
              companyId: employee.companyId,
              redemptionCode: offer?.redemption?.configuration?.code ?? null,
              discountAmount,
              spentAmount: null,
              savingsAmount: savings,
              branchId: null,
              merchantNotes: encodeMethod("IN_STORE"),
              employeeNotes: body?.notes ?? null,
              isVerified: true,
              verifiedAt: now,
              rejectionReason: REJECTION_REASON, // merchant declined
              redeemedAt: now,
            },
          });

          await linkAttemptToRedemption(tx, claim.attemptId, r.id);
          await tx.offerRedemption.update({
            where: { offerId: offer.id },
            data: { currentRedemptions: { increment: 1 } },
          });
          await tx.offerAnalytics.upsert({
            where: { offerId: offer.id },
            create: { offerId: offer.id, clickCount: 1 },
            update: { clickCount: { increment: 1 } },
          });

          return r;
        },
        { timeout: 15000, maxWait: 5000 },
      );
    } catch (err) {
      if (err instanceof AlreadyRedeemedError)
        return fail(err.message, "ALREADY_REDEEMED");
      if (err instanceof OfferLimitReachedError)
        return fail(err.message, "LIMIT_REACHED");
      throw err; // the transaction rolled back, so nothing to release
    }

    // ── 7. Side effects (never fail the response) ───────────────
    void publishBusinessNotification({
      ...BUSINESS_NOTIFICATION_TEMPLATES.redemptionSuccessful(offer.merchant.businessName),
      recipients: [{ role: "merchant", id: offer.merchantId }],
      channels: channels("IN_APP", "PUSH"),
      referenceType: "redemption",
      referenceId: redemption.id,
      metadata: {
        employeeId: employee.id,
        offerId: offer.id,
        redeemedAt: redemption.redeemedAt.toISOString(),
        status: "REJECTED",
        rejectionReason: redemption.rejectionReason,
      },
    }).catch((e) => console.error("[AUTO_REJECT] notify failed", e));

    void createAuditLog({
      actorType: "employee",
      actorId: employee.id,
      action: `REDEMPTION_REJECTED_${VIRTUAL_CARD_AUTO_VERIFY}`,
      entityType: "redemption",
      entityId: redemption.id,
      metadata: {
        offerId: offer.id,
        merchantId: offer.merchantId,
        redemptionType: VIRTUAL_CARD_AUTO_VERIFY,
        rejectionReason: redemption.rejectionReason,
        loginSource: "mobile",
      },
    }).catch((e) => console.error("[AUTO_REJECT] audit failed", e));

    return NextResponse.json(
      {
        success: true,
        data: {
          id: redemption.id,
          type: VIRTUAL_CARD_AUTO_VERIFY,
          status: "REJECTED",
          redemptionCode: redemption.redemptionCode,
          rejectionReason: redemption.rejectionReason,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[AUTO_REJECT] error", error);
    return fail("Internal server error", "INTERNAL", 500);
  }
}