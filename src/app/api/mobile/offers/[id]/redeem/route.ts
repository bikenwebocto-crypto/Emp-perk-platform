import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { internalError, notFound, badRequest } from "@/lib/employee-helpers";
import { getAuthenticatedMobileEmployee } from "@/lib/mobile-auth";
import { checkRedemptionEligibility } from "@/lib/offer-visibility";
import { encodeMethod } from "@/lib/redemption-status";
import { generateRedemptionCode } from "@/lib/redemption-code";
import { VIRTUAL_CARD_AUTO_VERIFY, buildVirtualCard } from "@/lib/virtual-card";
import {
  AlreadyRedeemedError,
  OfferLimitReachedError,
  claimAttempt,
  ensureCapacityRow,
  linkAttemptToRedemption,
  releaseCapacity,
  reserveCapacity,
} from "@/lib/redemption-tracking";
import { createAuditLog } from "@/services/audit-log.service";
import {
  BUSINESS_NOTIFICATION_TEMPLATES,
  channels,
  publishBusinessNotification,
} from "@/services/business-notification.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request);
    if (!auth.ok) return auth.response;
    const { id: offerId } = await params;
    if (!offerId) return badRequest("Offer id is required");

    const body = await request.json();
    const { branchId, notes, spentAmount } = body ?? {};

    const eligibility = await checkRedemptionEligibility(
      offerId,
      auth.employee.id,
    );
    if (!eligibility.eligible) {
      return badRequest(
        eligibility.reason ?? "Not eligible to redeem this offer",
      );
    }

    const offer = await prisma.merchantOffer.findFirst({
      where: { id: offerId, deletedAt: null },
      include: {
        merchant: { select: { id: true, businessName: true, website: true } },
        pricing: { select: { configuration: true } },
        redemption: {
          select: {
            redemptionType: true,
            configuration: true,
            maxRedemptions: true,
            currentRedemptions: true,
          },
        },
      },
    });
    if (!offer) return notFound("Offer not found");

    if (offer.status !== "LIVE") {
      return badRequest("This offer is no longer available.");
    }
    const now = new Date();
    if (offer.startDate > now || offer.endDate <= now) {
      return badRequest("This offer is no longer available.");
    }

    const redemptionType = offer.redemption?.redemptionType ?? null;
    if (!redemptionType) {
      return badRequest(
        "This offer does not have a redemption type configured",
      );
    }

    const pricingConfig =
      (offer.pricing?.configuration as Record<string, unknown>) ?? {};
    const redemptionConfig =
      (offer.redemption?.configuration as Record<string, unknown>) ?? {};

    // ONLINE_CODE: the server generates a fresh unique per-redemption code
    // at redemption time (proof-of-redemption identifier). The employee no
    // longer needs to know or submit a pre-existing code.
    if (redemptionType === "BOOKING_LINK" && !redemptionConfig.bookingUrl) {
      return badRequest("This offer does not have a booking link");
    }

    let validBranch: { id: string } | null = null;
    if (branchId) {
      const branch = await prisma.merchantBranch.findFirst({
        where: { id: branchId, merchantId: offer.merchantId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) return badRequest("Invalid branchId for this offer");
      validBranch = branch;
    }
    if (redemptionType === "IN_STORE_QR" && !validBranch) {
      return badRequest("Branch is required for in-store QR redemptions");
    }

    const maxRedemptions = offer.redemption?.maxRedemptions ?? null;
    const isPercentageOffer =
      offer.offerType === "PERCENTAGE" || offer.offerType === "percentage";
    const discountAmount = Number(
      pricingConfig.amount ?? pricingConfig.percent ?? 0,
    );
    const spent = spentAmount ? Number(spentAmount) : 0;
    const savings = isPercentageOffer
      ? 0 // unresolved — awaits billAmount entry
      : discountAmount;
    const status = redemptionType === "ONLINE_CODE" ? "PENDING" : "CONFIRMED";

    const method =
      redemptionType === "ONLINE_CODE"
        ? ("ONLINE" as const)
        : redemptionType === "BOOKING_LINK"
          ? ("ONLINE" as const)
          : ("IN_STORE" as const);

    let reservationToken: string | null = null;
    try {
      const redemption = await prisma.$transaction(
        async (tx) => {
          const claim = await claimAttempt(tx, offer.id, auth.employee.id);
          if (!claim.ok) throw new AlreadyRedeemedError();

          await ensureCapacityRow(tx, offer.id, maxRedemptions);
          const reserve = await reserveCapacity(tx, offer.id);
          if (!reserve.ok) throw new OfferLimitReachedError();

          const r = await tx.redemption.create({
            data: {
              merchantId: offer.merchantId,
              offerId: offer.id,
              employeeId: auth.employee.id,
              companyId: auth.employee.companyId,
              // Unique per-redemption proof-of-redemption code — generated
              // fresh for every redemption, regardless of type.
              redemptionCode: generateRedemptionCode(),
              discountAmount,
              spentAmount: spent || null,
              savingsAmount: savings,
              branchId: validBranch?.id ?? null,
              merchantNotes: encodeMethod(method),
              employeeNotes: notes ?? null,
              isVerified: status === "CONFIRMED",
              verifiedAt: status === "CONFIRMED" ? new Date() : null,
              redeemedAt: new Date(),
            },
          });

          await linkAttemptToRedemption(tx, claim.attemptId!, r.id);
          await tx.offerRedemption.update({
            where: { offerId: offer.id },
            data: { currentRedemptions: { increment: 1 } },
          });
          await tx.offerAnalytics.upsert({
            where: { offerId: offer.id },
            create: { offerId: offer.id, clickCount: 1 },
            update: { clickCount: { increment: 1 } },
          });

          reservationToken = claim.attemptId ?? null;
          return r;
        },
        { timeout: 15000, maxWait: 5000 },
      );

      const template =
        status === "PENDING"
          ? BUSINESS_NOTIFICATION_TEMPLATES.redemptionPending(
              offer.merchant.businessName,
            )
          : BUSINESS_NOTIFICATION_TEMPLATES.redemptionSuccessful(
              offer.merchant.businessName,
            );

      await publishBusinessNotification({
        ...template,
        recipients: [{ role: "merchant", id: offer.merchantId }],
        channels: channels("IN_APP", "PUSH"),
        referenceType: "redemption",
        referenceId: redemption.id,
        metadata: {
          employeeId: auth.employee.id,
          offerId: offer.id,
          branchId: validBranch?.id ?? null,
          redeemedAt:
            redemption.redeemedAt?.toISOString() ?? new Date().toISOString(),
          status,
        },
      });

      void createAuditLog({
        actorType: "employee",
        actorId: auth.employee.id,
        action: `REDEMPTION_CREATED_${redemptionType}`,
        entityType: "redemption",
        entityId: redemption.id,
        metadata: {
          offerId,
          merchantId: offer.merchantId,
          method,
          branchId: validBranch?.id ?? null,
          redemptionType,
          offerCode:
            redemptionType === "ONLINE_CODE" ? redemption.redemptionCode : null,
          loginSource: "mobile",
        },
      });

      const data: Record<string, unknown> = {
        id: redemption.id,
        type: redemptionType,
        status,
      };

      if (redemptionType === "IN_STORE_QR" && validBranch) {
        const branch = await prisma.merchantBranch.findFirst({
          where: { id: validBranch.id },
          select: {
            name: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            state: true,
            postalCode: true,
            phone: true,
            latitude: true,
            longitude: true,
            openingHours: true,
          },
        });
        if (branch) {
          const lat = branch.latitude ? Number(branch.latitude) : null;
          const lng = branch.longitude ? Number(branch.longitude) : null;
          data.merchant = {
            businessName: offer.merchant.businessName,
            website: offer.merchant.website,
          };
          data.branch = {
            name: branch.name,
            addressLine1: branch.addressLine1,
            addressLine2: branch.addressLine2,
            city: branch.city,
            state: branch.state,
            postalCode: branch.postalCode,
            phone: branch.phone,
            latitude: lat,
            longitude: lng,
            openingHours: branch.openingHours,
            googleMapsUrl:
              lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null,
          };
          data.instructions = redemptionConfig.instructions ?? null;
        }
      }

      if (redemptionType === "ONLINE_CODE") {
        // The employee's own unique code from the created record — not the
        // offer's shared config code.
        data.offerCode = redemption.redemptionCode;
        data.merchantWebsite = redemptionConfig.bookingUrl ?? null;
        data.instructions = redemptionConfig.instructions ?? null;
      }

      if (redemptionType === "BOOKING_LINK") {
        data.bookingUrl = redemptionConfig.bookingUrl ?? null;
        data.instructions = redemptionConfig.instructions ?? null;
      }

      if (redemptionType === VIRTUAL_CARD_AUTO_VERIFY) {
        data.virtualCard = await buildVirtualCard({
          employeeId: auth.employee.id,
          merchantName: offer.merchant.businessName,
          offerTitle: offer.title,
          redemptionCode: redemption.redemptionCode,
          redeemedAt: redemption.redeemedAt,
        });
        data.instructions = redemptionConfig.instructions ?? null;
      }

      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (err: unknown) {
      if (err instanceof OfferLimitReachedError) return badRequest(err.message);
      if (err instanceof AlreadyRedeemedError) return badRequest(err.message);
      if (reservationToken)
        await releaseCapacity(prisma, offer.id).catch(() => {});
      throw err;
    }
  } catch (error) {
    return internalError(error);
  }
}
