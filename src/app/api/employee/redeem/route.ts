import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getEmployeeFromSession,
  unauthorized,
  internalError,
  companyInactive,
  notFound,
  badRequest,
} from "@/lib/employee-session";
import { generateRedemptionCode } from "@/lib/redemption-code";
import { VIRTUAL_CARD_AUTO_VERIFY, buildVirtualCard } from "@/lib/virtual-card";
import {
  AlreadyRedeemedError,
  OfferLimitReachedError,
  OfferNotActiveError,
  claimAttempt,
  ensureCapacityRow,
  linkAttemptToRedemption,
  releaseCapacity,
  reserveCapacity,
} from "@/lib/redemption-tracking";
import {
  deriveStatus,
  encodeMethod,
  RedemptionMethod,
} from "@/lib/redemption-status";

export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return unauthorized();
    if ("inactive" in employee) return companyInactive(employee.companyStatus);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;

    const where: any = { employeeId: employee.id };
    if (status) {
      if (status === "PENDING") {
        where.isVerified = false;
        where.AND = [
          {
            OR: [
              { merchantNotes: null },
              { merchantNotes: { not: { startsWith: "REJECTED:" } } },
            ],
          },
          {
            OR: [
              { employeeNotes: null },
              { employeeNotes: { not: { startsWith: "CANCELLED:" } } },
            ],
          },
        ];
      } else if (status === "CONFIRMED") {
        where.isVerified = true;
      } else if (status === "REJECTED") {
        where.merchantNotes = { startsWith: "REJECTED:" };
      } else if (status === "CANCELLED") {
        where.employeeNotes = { startsWith: "CANCELLED:" };
      }
    }

    const rows = await prisma.redemption.findMany({
      where,
      orderBy: { redeemedAt: "desc" },
      take: 100,
      include: {
        offer: {
          select: {
            id: true,
            title: true,
            offerType: true,
            pricing: { select: { configuration: true } },
            redemption: {
              select: { redemptionType: true, configuration: true },
            },
          },
        },
        merchant: { select: { id: true, businessName: true, logoUrl: true } },
        company: { select: { id: true, name: true } },
      },
    });

    const branchIds = Array.from(
      new Set(rows.map((r) => r.branchId).filter((b): b is string => !!b)),
    );
    const branchList = branchIds.length
      ? await prisma.merchantBranch.findMany({
          where: { id: { in: branchIds } },
          select: { id: true, name: true, branchType: true },
        })
      : [];
    const branchMap = new Map(branchList.map((b) => [b.id, b]));

    const data = rows.map((r) => ({
      id: r.id,
      merchantId: r.merchantId,
      offerId: r.offerId,
      employeeId: r.employeeId,
      companyId: r.companyId,

      redemptionCode: r.redemptionCode,
      discountAmount: r.discountAmount,
      spentAmount: r.spentAmount,
      savingsAmount: r.savingsAmount,
      billAmount: r.billAmount,
      loggedSavingAmount: r.loggedSavingAmount,
      quantityPurchased: r.quantityPurchased,

      savingMethod: r.savingMethod,
      savingLoggedAt: r.savingLoggedAt,
      savingEditedAt: r.savingEditedAt,

      // ADD THESE
      savingValidationStatus: r.savingValidationStatus,
      savingValidationMessage: r.savingValidationMessage,

      branchId: r.branchId,
      merchantNotes: r.merchantNotes,
      employeeNotes: r.employeeNotes,
      isVerified: r.isVerified,
      verifiedBy: r.verifiedBy,
      verifiedAt: r.verifiedAt,
      redeemedAt: r.redeemedAt,
      createdAt: r.createdAt,

      offer: r.offer,
      merchant: r.merchant,
      company: r.company,
      branch: r.branchId ? (branchMap.get(r.branchId) ?? null) : null,

      status: deriveStatus(r),

      method: ((): RedemptionMethod | null => {
        const m = r.merchantNotes?.match(/^METHOD:(\w+)/);
        return (m?.[1] as RedemptionMethod) ?? null;
      })(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return internalError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return unauthorized();
    if ("inactive" in employee) return companyInactive(employee.companyStatus);

    const body = await request.json();
    const { offerId, branchId, notes, spentAmount } = body ?? {};

    if (!offerId) return badRequest("offerId is required");

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

    // Offer status & date window
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

    // Branch validation
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

    // For flat/fixed discounts, the savings amount is known immediately —
    // it's just the discount value. For percentage-based offers, real
    // savings can't be computed without knowing what the employee actually
    // spent (which isn't collected at redemption time), so leave it
    // unresolved until the employee logs their bill via the Savings
    // Tracker flow.
    const savings = isPercentageOffer
      ? 0 // unresolved — awaits billAmount/loggedSavingAmount entry
      : discountAmount; // FLAT/fixed/BOGO: known at redemption time
    const status = redemptionType === "ONLINE_CODE" ? "PENDING" : "CONFIRMED";
    const method =
      redemptionType === "ONLINE_CODE"
        ? ("ONLINE" as const)
        : redemptionType === "BOOKING_LINK"
          ? ("ONLINE" as const)
          : ("IN_STORE" as const);

    // ── Transaction: claim → reserve capacity → create redemption
    let reservationToken: string | null = null;
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const claim = await claimAttempt(tx, offer.id, employee.id);
          if (!claim.ok) {
            throw new AlreadyRedeemedError();
          }

          await ensureCapacityRow(tx, offer.id, maxRedemptions);

          const reserve = await reserveCapacity(tx, offer.id);
          if (!reserve.ok) {
            throw new OfferLimitReachedError();
          }

          const redemption = await tx.redemption.create({
            data: {
              merchantId: offer.merchantId,
              offerId: offer.id,
              employeeId: employee.id,
              companyId: employee.companyId,
              // Unique per-redemption proof-of-redemption code — generated
              // fresh for every redemption, regardless of type.
              redemptionCode: generateRedemptionCode(),
              discountAmount,
              spentAmount: spent || null,
              savingsAmount: savings ?? 0,
              branchId: validBranch?.id ?? null,
              merchantNotes: encodeMethod(method),
              employeeNotes: notes ?? null,
              isVerified: status === "CONFIRMED",
              verifiedAt: status === "CONFIRMED" ? new Date() : null,
              redeemedAt: new Date(),
            },
          });

          await linkAttemptToRedemption(tx, claim.attemptId!, redemption.id);

          // Keep the existing denormalized counter in sync for non-atomic reads.
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
          return redemption;
        },
        { timeout: 15000, maxWait: 5000 },
      );

      // Build response
      const data: Record<string, unknown> = {
        id: result.id,
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
        data.offerCode = result.redemptionCode;
        data.merchantWebsite = redemptionConfig.bookingUrl ?? null;
        data.instructions = redemptionConfig.instructions ?? null;
      }

      if (redemptionType === "BOOKING_LINK") {
        data.bookingUrl = redemptionConfig.bookingUrl ?? null;
        data.instructions = redemptionConfig.instructions ?? null;
      }

      if (redemptionType === VIRTUAL_CARD_AUTO_VERIFY) {
        data.virtualCard = await buildVirtualCard({
          employeeId: employee.id,
          merchantName: offer.merchant.businessName,
          offerTitle: offer.title,
          redemptionCode: result.redemptionCode,
          redeemedAt: result.redeemedAt,
        });
        data.instructions = redemptionConfig.instructions ?? null;
      }

      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (err: unknown) {
      // Roll back reserved capacity if the transaction failed after reserve.
      if (err instanceof OfferLimitReachedError) {
        return badRequest(err.message);
      }
      if (err instanceof AlreadyRedeemedError) {
        return badRequest(err.message);
      }
      if (err instanceof OfferNotActiveError) {
        return badRequest(err.message);
      }
      if (reservationToken) {
        await releaseCapacity(prisma, offer.id).catch(() => {});
      }
      throw err;
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // unique violation on Attempt shouldn't escape — handled above
      return internalError(error);
    }
    return internalError(error);
  }
}
