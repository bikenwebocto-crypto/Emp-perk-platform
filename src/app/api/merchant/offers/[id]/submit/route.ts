import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMerchantFromSession } from "@/lib/merchant-session";
import { createAuditLog } from "@/services/audit-log.service";
import {
  BUSINESS_NOTIFICATION_TEMPLATES,
  channels,
  publishBusinessNotification,
  publishBusinessToAdmins,
} from "@/services/business-notification.service";
import { OfferStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/supabase/server";

function unauthorized() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    },
    { status: 401 },
  );
}

function notFound() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "NOT_FOUND", message: "Offer not found" },
    },
    { status: 404 },
  );
}

function forbidden(msg: string) {
  return NextResponse.json(
    { success: false, error: { code: "FORBIDDEN", message: msg } },
    { status: 403 },
  );
}

function conflict(msg: string) {
  return NextResponse.json(
    { success: false, error: { code: "CONFLICT", message: msg } },
    { status: 409 },
  );
}

function internalError(error: unknown) {
  console.error("Merchant offer submit error:", error);
  return NextResponse.json(
    {
      success: false,
      error: { code: "INTERNAL", message: "Internal server error" },
    },
    { status: 500 },
  );
}

const ALLOWED_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp"];
const SUBMITTABLE_STATUSES: OfferStatus[] = [
  "DRAFT",
  "VALIDATION_FAILED",
  "CHANGES_REQUESTED",
  "ARCHIVED",
  "AWAITING_APPROVAL",
];

function runQualityChecks(body: any): {
  passed: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  if (!body.title || body.title.trim().length < 5)
    errors.title = "Title must be at least 5 characters";
  if (body.title && body.title.length > 255)
    errors.title = "Title must be at most 255 characters";
  if (body.description && body.description.length > 2000)
    errors.description = "Description must be at most 2000 characters";
  if (body.shortDescription && body.shortDescription.length > 500)
    errors.shortDescription =
      "Short description must be at most 500 characters";
  if (!body.offerType) errors.offerType = "Offer type is required";

  const ot = body.offerType;
  if (ot === "flat_rate" || ot === "fixed_amount") {
    if (body.discountValue == null || Number(body.discountValue) <= 0) {
      errors.discountValue = "Discount value is required for flat offers";
    }
  } else if (ot === "percentage") {
    if (body.discountPercent == null || Number(body.discountPercent) <= 0) {
      errors.discountPercent =
        "Discount percentage is required for percentage offers";
    } else if (Number(body.discountPercent) > 90) {
      errors.discountPercent = "Discount percentage cannot exceed 90%";
    }
  } else if (ot === "buy_x_get_y") {
    if (!body.buyQuantity || Number(body.buyQuantity) <= 0)
      errors.buyQuantity = "Buy quantity is required";
    if (!body.buyItem?.trim()) errors.buyItem = "Buy item is required";
    if (!body.getQuantity || Number(body.getQuantity) <= 0)
      errors.getQuantity = "Get quantity is required";
    if (!body.freeItem?.trim()) errors.freeItem = "Free item is required";
  }

  if (!body.startDate) errors.startDate = "Start date is required";
  if (!body.endDate) errors.endDate = "End date is required";
  if (
    body.startDate &&
    body.endDate &&
    new Date(body.endDate) <= new Date(body.startDate)
  )
    errors.endDate = "End date must be after start date";
  if (!body.termsAndConditions)
    errors.termsAndConditions = "Terms and conditions are required";
  if (!body.categoryId) errors.categoryId = "Category is required";
  if (body.imageUrls && Array.isArray(body.imageUrls)) {
    for (const url of body.imageUrls) {
      if (typeof url === "string" && url.trim()) {
        const ext = url.split(".").pop()?.toLowerCase();
        if (!ext || !ALLOWED_IMAGE_FORMATS.includes(ext)) {
          errors.imageUrls = `Image format not supported. Allowed: ${ALLOWED_IMAGE_FORMATS.join(", ")}`;
          break;
        }
      }
    }
  }
  return { passed: Object.keys(errors).length === 0, errors };
}

/**
 * Everything here is side-effect / notification work that the merchant does
 * NOT need to wait for. Called without `await` from the handler — errors are
 * caught and logged here so they never bubble up and never affect the
 * response that's already been sent to the client.
 */
async function firePostSubmitSideEffects(params: {
  qcPassed: boolean;
  qcErrors: Record<string, string>;
  finalOfferId: string;
  finalOfferTitle: string;
  merchantId: string;
  merchantBusinessName: string;
  replacesOfferId: string | null;
}) {
  const {
    qcPassed,
    qcErrors,
    finalOfferId,
    finalOfferTitle,
    merchantId,
    merchantBusinessName,
    replacesOfferId,
  } = params;

  try {
    if (!qcPassed) {
      const template =
        BUSINESS_NOTIFICATION_TEMPLATES.offerValidationFailed(finalOfferTitle);
      await publishBusinessNotification({
        ...template,
        recipients: [{ role: "merchant", id: merchantId }],
        channels: channels("IN_APP"),
        referenceType: "merchant_offer",
        referenceId: finalOfferId,
        metadata: { validationErrors: qcErrors },
      });
      return;
    }

    if (!replacesOfferId) {
      const template =
        BUSINESS_NOTIFICATION_TEMPLATES.offerSubmitted(finalOfferTitle);
      await publishBusinessToAdmins({
        ...template,
        channels: channels("IN_APP", "PUSH"),
        referenceType: "merchant_offer",
        referenceId: finalOfferId,
        metadata: { merchantId },
      });
    }

    if (replacesOfferId) {
      const currentLive = await prisma.merchantOffer.findUnique({
        where: { id: replacesOfferId },
      });

      if (currentLive?.status === "LIVE") {
        await prisma.offerReplacementRequest.create({
          data: {
            currentOfferId: replacesOfferId,
            newOfferId: finalOfferId,
            status: "AWAITING_APPROVAL",
          },
        });

        await prisma.actionQueueItem.create({
          data: {
            type: "FIRST_OFFER_APPROVAL",
            title: `Offer Approval: ${finalOfferTitle}`,
            description: `Merchant ${merchantBusinessName} submitted an offer for approval`,
            referenceId: merchantId,
            referenceType: "MERCHANT",
            status: "PENDING",
            priority: 1,
            metadata: {
              currentOfferId: replacesOfferId,
              newOfferId: finalOfferId,
            },
          },
        });
      }
    } else {
      const existingItems = await prisma.actionQueueItem.findMany({
        where: {
          referenceId: merchantId,
          type: "FIRST_OFFER_APPROVAL",
          status: "PENDING",
        },
      });
      const hasExisting = existingItems.some((i) => {
        const meta = i.metadata as Record<string, unknown> | null;
        return meta?.offerId === finalOfferId;
      });
      if (!hasExisting) {
        await prisma.actionQueueItem.create({
          data: {
            type: "FIRST_OFFER_APPROVAL",
            title: `Offer Approval: ${finalOfferTitle}`,
            description: `Merchant ${merchantBusinessName} submitted an offer for approval`,
            referenceId: merchantId,
            referenceType: "MERCHANT",
            status: "PENDING",
            priority: 1,
            metadata: { offerId: finalOfferId },
          },
        });
      }
    }

    await createAuditLog({
      actorType: "merchant",
      actorId: merchantId,
      action: "OFFER_SUBMITTED_FOR_APPROVAL",
      entityType: "MERCHANT_OFFER",
      entityId: finalOfferId,
      metadata: {
        title: finalOfferTitle,
        replacesOfferId: replacesOfferId ?? null,
      },
    });
  } catch (err) {
    // Never let a notification/audit failure surface to the client —
    // the offer record itself already saved and committed successfully.
    console.error("[SUBMIT OFFER] Post-submit side effect failed:", err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const merchant = await getMerchantFromSession();
    const user = await getCurrentUser();

    const isAdmin = user?.userType === "admin";
    if (!isAdmin && !merchant) {
      return unauthorized();
    }

    const { id } = await params;

    const offer = await prisma.merchantOffer.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(merchant ? { merchantId: merchant.id } : {}),
      },
      include: {
        content: {
          select: {
            description: true,
            shortDescription: true,
            termsAndConditions: true,
            imageUrls: true,
          },
        },
        pricing: { select: { configuration: true } },
        redemption: { select: { redemptionType: true, configuration: true } },
        review: { select: { validationErrors: true } },
        // Admins skip the merchantId filter, so resolve the owning merchant
        // from the offer row rather than the caller's session.
        merchant: { select: { id: true, businessName: true, categoryId: true } },
      },
    });

    if (!offer) {
      return notFound();
    }

    const redemptionConfig =
      (offer.redemption?.configuration as Record<string, unknown>) ?? {};
    const qrCodeUrl = redemptionConfig.qrCodeUrl as string | undefined;

    console.log("[SUBMIT OFFER] Start - offer:", {
      id: offer.id,
      title: offer.title,
      status: offer.status,
      redemptionType: offer.redemption?.redemptionType,
      hasQrCodeUrl: !!qrCodeUrl,
    });

    if (!SUBMITTABLE_STATUSES.includes(offer.status)) {
      console.log(
        "[SUBMIT OFFER] ❌ Cannot submit, current status:",
        offer.status,
      );
      return forbidden(
        "Only draft, validation-failed, or changes-requested offers can be submitted",
      );
    }

    // Offer category always mirrors the owning merchant's category; any client value is ignored.
    const categoryId = (merchant ?? offer.merchant).categoryId;
    if (!categoryId) {
      return NextResponse.json(
        { success: false, error: { code: "MISSING_CATEGORY", message: "Your business category is not set. Please contact support." } },
        { status: 400 },
      );
    }

    const body = await request.json();
    console.log("[SUBMIT OFFER] Body received:", Object.keys(body));

    const pricingConfig =
      (offer.pricing?.configuration as Record<string, unknown>) ?? {};

    const qcResult = runQualityChecks({
      ...offer,
      ...pricingConfig,
      ...body,
      description: body.description ?? offer.content?.description,
      shortDescription:
        body.shortDescription ?? offer.content?.shortDescription,
      termsAndConditions:
        body.termsAndConditions ?? offer.content?.termsAndConditions,
      imageUrls: body.imageUrls ?? offer.content?.imageUrls,
      offerType: body.offerType ?? offer.offerType,
      discountValue:
        body.discountValue ?? pricingConfig.amount ?? pricingConfig.percent,
      discountPercent: body.discountPercent ?? pricingConfig.percent,
      buyQuantity: body.buyQuantity ?? pricingConfig.buyQuantity,
      buyItem: body.buyItem ?? pricingConfig.buyItem,
      getQuantity: body.getQuantity ?? pricingConfig.getQuantity,
      freeItem: body.freeItem ?? pricingConfig.freeItem,
      categoryId,
    });
    console.log("[SUBMIT OFFER] qcResult.passed:", qcResult.passed);

    const targetStatus = qcResult.passed
      ? "AWAITING_APPROVAL"
      : "VALIDATION_FAILED";
    console.log("[SUBMIT OFFER] targetStatus:", targetStatus);

    // ── Step 1: persist the record. Nothing here is optional — if this
    // fails, the client correctly gets an error.
    const offerId = await prisma.$transaction(
      async (tx) => {
        if (
          body.shortDescription !== undefined ||
          body.description !== undefined ||
          body.termsAndConditions !== undefined ||
          body.imageUrls !== undefined
        ) {
          await tx.offerContent.upsert({
            where: { offerId: id },
            create: {
              offerId: id,
              shortDescription: body.shortDescription ?? null,
              description: body.description ?? null,
              termsAndConditions: body.termsAndConditions ?? null,
              imageUrls: body.imageUrls ?? [],
            },
            update: {
              ...(body.shortDescription !== undefined && {
                shortDescription: body.shortDescription,
              }),
              ...(body.description !== undefined && {
                description: body.description,
              }),
              ...(body.termsAndConditions !== undefined && {
                termsAndConditions: body.termsAndConditions,
              }),
              ...(body.imageUrls !== undefined && {
                imageUrls: body.imageUrls,
              }),
            },
          });
        }

        if (
          body.offerType !== undefined ||
          body.discountValue !== undefined ||
          body.discountMax !== undefined ||
          body.discountPercent !== undefined ||
          body.minimumSpend !== undefined ||
          body.buyQuantity !== undefined ||
          body.buyItem !== undefined ||
          body.getQuantity !== undefined ||
          body.freeItem !== undefined ||
          body.maxFreeItems !== undefined
        ) {
          const config =
            (offer.pricing?.configuration as Record<string, unknown>) ?? {};
          const newPricingConfig: Record<string, unknown> = { ...config };
          if (body.discountValue !== undefined)
            newPricingConfig.amount =
              body.discountValue === null || body.discountValue === ""
                ? config.amount
                : Number(body.discountValue);
          if (body.discountPercent !== undefined)
            newPricingConfig.percent =
              body.discountPercent === null || body.discountPercent === ""
                ? config.percent
                : Number(body.discountPercent);
          if (body.discountMax !== undefined)
            newPricingConfig.maximumDiscount =
              body.discountMax === null || body.discountMax === ""
                ? config.maximumDiscount
                : Number(body.discountMax);
          if (body.minimumSpend !== undefined)
            newPricingConfig.minimumSpend =
              body.minimumSpend === null || body.minimumSpend === ""
                ? config.minimumSpend
                : Number(body.minimumSpend);
          if (body.buyQuantity !== undefined)
            newPricingConfig.buyQuantity =
              body.buyQuantity === null || body.buyQuantity === ""
                ? config.buyQuantity
                : Number(body.buyQuantity);
          if (body.buyItem !== undefined)
            newPricingConfig.buyItem =
              body.buyItem === null || body.buyItem === ""
                ? config.buyItem
                : body.buyItem;
          if (body.getQuantity !== undefined)
            newPricingConfig.getQuantity =
              body.getQuantity === null || body.getQuantity === ""
                ? config.getQuantity
                : Number(body.getQuantity);
          if (body.freeItem !== undefined)
            newPricingConfig.freeItem =
              body.freeItem === null || body.freeItem === ""
                ? config.freeItem
                : body.freeItem;
          if (body.maxFreeItems !== undefined)
            newPricingConfig.maxFreeItems =
              body.maxFreeItems === null || body.maxFreeItems === ""
                ? config.maxFreeItems
                : Number(body.maxFreeItems);

          await tx.offerPricing.upsert({
            where: { offerId: id },
            create: {
              offerId: id,
              pricingType: body.offerType ?? offer.offerType,
              configuration: newPricingConfig as any,
            },
            update: {
              ...(body.offerType !== undefined && {
                pricingType: body.offerType,
              }),
              configuration: newPricingConfig as any,
            },
          });
        }

        if (
          body.redemptionType !== undefined ||
          body.redemptionCode !== undefined ||
          body.redemptionInstructions !== undefined ||
          body.bookingUrl !== undefined ||
          body.maxRedemptions !== undefined ||
          body.daysOfWeek !== undefined
        ) {
          const config =
            (offer.redemption?.configuration as Record<string, unknown>) ?? {};
          const newRedemptionConfig: Record<string, unknown> = { ...config };
          if (body.redemptionCode !== undefined)
            newRedemptionConfig.code = body.redemptionCode;
          if (body.redemptionInstructions !== undefined)
            newRedemptionConfig.instructions = body.redemptionInstructions;
          if (body.bookingUrl !== undefined)
            newRedemptionConfig.bookingUrl = body.bookingUrl;

          await tx.offerRedemption.upsert({
            where: { offerId: id },
            create: {
              offerId: id,
              redemptionType: body.redemptionType ?? null,
              configuration:
                Object.keys(newRedemptionConfig).length > 0
                  ? (newRedemptionConfig as any)
                  : null,
              maxRedemptions: body.maxRedemptions ?? null,
              currentRedemptions: 0,
              daysOfWeek: body.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
            },
            update: {
              ...(body.redemptionType !== undefined && {
                redemptionType: body.redemptionType,
              }),
              ...(Object.keys(newRedemptionConfig).length > 0 && {
                configuration: newRedemptionConfig as any,
              }),
              ...(body.maxRedemptions !== undefined && {
                maxRedemptions:
                  body.maxRedemptions === null || body.maxRedemptions === ""
                    ? null
                    : Number(body.maxRedemptions),
              }),
              ...(body.daysOfWeek !== undefined && {
                daysOfWeek: Array.isArray(body.daysOfWeek)
                  ? body.daysOfWeek
                  : [0, 1, 2, 3, 4, 5, 6],
              }),
            },
          });

          if (body.maxRedemptions !== undefined) {
            const normalizedMaxRedemptions =
              body.maxRedemptions === null || body.maxRedemptions === ""
                ? null
                : Number(body.maxRedemptions);
            await tx.offerRedemptionCapacity.upsert({
              where: { offerId: id },
              create: {
                offerId: id,
                maxRedemptions: normalizedMaxRedemptions,
                redeemedCount: 0,
              },
              update: { maxRedemptions: normalizedMaxRedemptions },
            });
          }
        }

        const merchantOfferUpdatable: Record<string, unknown> = {};
        if (body.startDate)
          merchantOfferUpdatable.startDate = new Date(body.startDate);
        if (body.endDate)
          merchantOfferUpdatable.endDate = new Date(body.endDate);
        merchantOfferUpdatable.categoryId = categoryId;
        if (body.offerType !== undefined)
          merchantOfferUpdatable.offerType = body.offerType;
        if (body.title !== undefined) merchantOfferUpdatable.title = body.title;

        if (Object.keys(merchantOfferUpdatable).length > 0) {
          await tx.merchantOffer.update({
            where: { id },
            data: merchantOfferUpdatable,
          });
        }

        await tx.offerReview.upsert({
          where: { offerId: id },
          create: {
            offerId: id,
            validationErrors: qcResult.passed ? null : (qcResult.errors as any),
          },
          update: {
            validationErrors: qcResult.passed ? null : (qcResult.errors as any),
          },
        });

        const statusUpdate = await tx.merchantOffer.updateMany({
          where: { id, status: { in: SUBMITTABLE_STATUSES } },
          data: { status: targetStatus, submittedAt: new Date() },
        });

        if (statusUpdate.count === 0) {
          throw new Error("CONCURRENT_SUBMIT");
        }

        return id;
      },
      { timeout: 15000, maxWait: 5000 },
    );

    // ── Step 2: re-fetch the full record for the response payload.
    const finalOffer = await prisma.merchantOffer.findUniqueOrThrow({
      where: { id: offerId },
      include: {
        _count: { select: { redemptions: true } },
        content: true,
        pricing: true,
        redemption: true,
        review: true,
        analytics: true,
      },
    });

    // ── Step 3: build the response NOW. Everything below this point is
    // side-effect work the client doesn't need to wait on.
    const response = NextResponse.json({
      success: true,
      data: finalOffer,
      qualityCheck: qcResult.passed ? "PASSED" : "FAILED",
      validationErrors: qcResult.errors,
    });

    // ── Step 4: fire notifications + audit log WITHOUT awaiting.
    // Intentionally not `await`ed — errors are caught internally and never
    // affect the response already built above.
    void firePostSubmitSideEffects({
      qcPassed: qcResult.passed,
      qcErrors: qcResult.errors,
      finalOfferId: finalOffer.id,
      finalOfferTitle: finalOffer.title,
      merchantId: offer.merchantId,
      merchantBusinessName:
        offer.merchant?.businessName ?? merchant?.businessName ?? "Unknown",
      replacesOfferId: offer.replacesOfferId,
    });

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "CONCURRENT_SUBMIT") {
      return conflict(
        "This offer is already being submitted. Please refresh and try again.",
      );
    }
    return internalError(error);
  }
}
