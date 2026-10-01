import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMerchantFromSession } from '@/lib/merchant-session'
import { OfferStatus } from "@prisma/client";
import {
  ReplacementValidationError,
  validateReplacement,
} from "@/lib/offer-replacement";
import { logReplacementAudit, notifyReplacement } from "@/lib/offer-replacement-notifications";
import { createAuditLog } from '@/services/audit-log.service';
import { generateUniqueOfferCode } from '@/lib/offer-code';
import { BUSINESS_NOTIFICATION_TEMPLATES, channels, publishBusinessNotification, publishBusinessToAdmins } from '@/services/business-notification.service';

const MIN_TITLE_LENGTH = 5;
const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SHORT_DESCRIPTION_LENGTH = 500;
const ALLOWED_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp"];
const VALID_REDEMPTION_TYPES = ['ONLINE_CODE', 'BOOKING_LINK', 'IN_STORE_QR', 'VIRTUAL_CARD_AUTO_VERIFY'] as const;
const VALID_OFFER_TYPES = ['flat_rate', 'percentage', 'buy_x_get_y'] as const;

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
    { status: 401 },
  );
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "VALIDATION", message } },
    { status: 400 },
  );
}

function internalError(error: unknown) {
  console.error("Merchant offers error:", error);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL", message: "Internal server error" } },
    { status: 500 },
  );
}

function runQualityChecks(body: any): {
  passed: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const ot = body.offerType;

  if (!body.title || body.title.trim().length < MIN_TITLE_LENGTH) {
    errors.title = `Title must be at least ${MIN_TITLE_LENGTH} characters`;
  }
  if (body.title && body.title.length > MAX_TITLE_LENGTH) {
    errors.title = `Title must be at most ${MAX_TITLE_LENGTH} characters`;
  }
  if (body.description && body.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`;
  }
  if (
    body.shortDescription &&
    body.shortDescription.length > MAX_SHORT_DESCRIPTION_LENGTH
  ) {
    errors.shortDescription = `Short description must be at most ${MAX_SHORT_DESCRIPTION_LENGTH} characters`;
  }
  if (!ot) {
    errors.offerType = "Offer type is required";
  } else if (!VALID_OFFER_TYPES.includes(ot)) {
    errors.offerType = `Offer type must be one of: ${VALID_OFFER_TYPES.join(', ')}`;
  }

  if (ot === 'flat_rate') {
    if (body.discountValue == null || Number(body.discountValue) <= 0) {
      errors.discountValue = "Discount value is required for flat offers";
    }
  } else if (ot === 'percentage') {
    if (body.discountPercent == null || Number(body.discountPercent) <= 0) {
      errors.discountPercent = "Discount percentage is required for percentage offers";
    } else if (Number(body.discountPercent) > 90) {
      errors.discountPercent = "Discount percentage cannot exceed 90%";
    }
    if (body.discountMax != null && body.discountValue != null) {
      if (Number(body.discountMax) > Number(body.discountValue)) {
        errors.discountMax = "Maximum discount cannot exceed discount value";
      }
    }
  } else if (ot === 'buy_x_get_y') {
    if (!body.buyQuantity || Number(body.buyQuantity) <= 0) {
      errors.buyQuantity = "Buy quantity is required";
    }
    if (!body.buyItem?.trim()) {
      errors.buyItem = "Buy item is required";
    }
    if (!body.getQuantity || Number(body.getQuantity) <= 0) {
      errors.getQuantity = "Get quantity is required";
    }
    if (!body.freeItem?.trim()) {
      errors.freeItem = "Free item is required";
    }
  }

  if (!body.startDate) errors.startDate = "Start date is required";
  if (!body.endDate) errors.endDate = "End date is required";
  if (
    body.startDate &&
    body.endDate &&
    new Date(body.endDate) <= new Date(body.startDate)
  ) {
    errors.endDate = "End date must be after start date";
  }
  if (!body.termsAndConditions) {
    errors.termsAndConditions = "Terms and conditions are required";
  }
  if (!body.categoryId) {
    errors.categoryId = "Category is required";
  }
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
  if (body.daysOfWeek !== undefined && body.daysOfWeek !== null) {
    if (!Array.isArray(body.daysOfWeek)) {
      errors.daysOfWeek = "daysOfWeek must be an array of integers 0-6"
    } else if (body.daysOfWeek.length === 0) {
      errors.daysOfWeek = "Select at least one valid day"
    } else if (body.daysOfWeek.some((d: unknown) => typeof d !== 'number' || d < 0 || d > 6 || !Number.isInteger(d))) {
      errors.daysOfWeek = "Each day must be an integer between 0 and 6"
    }
  }

  return { passed: Object.keys(errors).length === 0, errors };
}

async function checkDuplicateOffer(
  merchantId: string,
  title: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await prisma.merchantOffer.findFirst({
    where: {
      merchantId,
      title: { equals: title, mode: "insensitive" },
      deletedAt: null,
      status: {
        in: [
          OfferStatus.LIVE,
          OfferStatus.AWAITING_APPROVAL,
          OfferStatus.VALIDATION_IN_PROGRESS,
        ],
      },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  return !!existing;
}

/**
 * Everything here is side-effect / notification / audit work that the
 * merchant does NOT need to wait for — the offer is already safely
 * created and committed by the time this runs. Called without `await`
 * from the handler; all errors are caught and logged locally so they
 * never affect a response that has already been sent.
 */
async function firePostCreateSideEffects(params: {
  saveAsDraft: boolean;
  qcPassed: boolean;
  qcErrors: Record<string, string>;
  offerId: string;
  title: string;
  merchantId: string;
  merchantBusinessName: string;
  replacesOfferId: string | null;
  replacementReason: string | null;
  redemptionType: string | null;
  offerCodeValue: string | null;
}) {
  const {
    saveAsDraft, qcPassed, qcErrors, offerId, title,
    merchantId, merchantBusinessName, replacesOfferId,
    replacementReason, redemptionType, offerCodeValue,
  } = params;

  try {
    if (!saveAsDraft && !qcPassed) {
      const template = BUSINESS_NOTIFICATION_TEMPLATES.offerValidationFailed(title);
      await publishBusinessNotification({
        ...template,
        recipients: [{ role: 'merchant', id: merchantId }],
        channels: channels('IN_APP'),
        referenceType: 'merchant_offer',
        referenceId: offerId,
        metadata: { validationErrors: qcErrors },
      });
      return;
    }

    if (saveAsDraft || !qcPassed) return;

    if (replacesOfferId) {
      await prisma.offerReplacementRequest.create({
        data: {
          currentOfferId: replacesOfferId,
          newOfferId: offerId,
          status: "AWAITING_APPROVAL",
          reason: replacementReason ?? null,
        },
      });

      await prisma.actionQueueItem.create({
        data: {
          type: "OFFER_REPLACEMENT",
          title: `Offer Replacement: ${title}`,
          description: `Merchant ${merchantBusinessName} submitted a replacement offer`,
          referenceId: merchantId,
          referenceType: "MERCHANT",
          status: "PENDING",
          priority: 1,
          metadata: {
            currentOfferId: replacesOfferId,
            newOfferId: offerId,
            reason: replacementReason ?? null,
          },
        },
      });

      await logReplacementAudit({
        event: 'OFFER_REPLACEMENT_CREATED',
        merchantId,
        newOfferId: offerId,
        currentOfferId: replacesOfferId,
        reason: replacementReason ?? undefined,
      });

      await notifyReplacement({
        event: 'SUBMITTED',
        merchantId,
        newOfferId: offerId,
        currentOfferId: replacesOfferId,
      }).catch((err) => console.error('Replacement submit notify failed', err));

      await notifyReplacement({
        event: 'ADMIN_PENDING',
        merchantId,
        newOfferId: offerId,
        currentOfferId: replacesOfferId,
      }).catch((err) => console.error('Replacement admin notify failed', err));
    } else {
      const existingItems = await prisma.actionQueueItem.findMany({
        where: { referenceId: merchantId, type: 'FIRST_OFFER_APPROVAL', status: 'PENDING' },
      });
      const hasExisting = existingItems.some((i) => {
        const meta = i.metadata as Record<string, unknown> | null;
        return meta?.offerId === offerId;
      });
      if (!hasExisting) {
        await prisma.actionQueueItem.create({
          data: {
            type: "FIRST_OFFER_APPROVAL",
            title: `Offer Approval: ${title}`,
            description: `Merchant ${merchantBusinessName} submitted an offer for approval`,
            referenceId: merchantId,
            referenceType: "MERCHANT",
            status: "PENDING",
            priority: 1,
            metadata: { offerId },
          },
        });
      }

      const template = BUSINESS_NOTIFICATION_TEMPLATES.offerSubmitted(title);
      await publishBusinessToAdmins({
        ...template,
        channels: channels('IN_APP', 'PUSH'),
        referenceType: 'merchant_offer',
        referenceId: offerId,
        metadata: { merchantId },
      });
    }

    await createAuditLog({
      actorType: 'merchant',
      actorId: merchantId,
      action: "OFFER_SUBMITTED_FOR_APPROVAL",
      entityType: "MERCHANT_OFFER",
      entityId: offerId,
      metadata: {
        title,
        replacesOfferId: replacesOfferId ?? null,
        redemptionType: redemptionType ?? null,
        offerCode: offerCodeValue ?? null,
      },
    });
  } catch (err) {
    // Never let a notification/audit failure surface to the client —
    // the offer record itself already saved and committed successfully.
    console.error('[MERCHANT OFFERS POST] Post-create side effect failed:', err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const merchant = await getMerchantFromSession();
    if (!merchant) return unauthorized();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "10")),
    );
    const status = searchParams.get("status");
    const q = searchParams.get("q");
    const scope = searchParams.get("scope");
    const search = searchParams.get("search")?.trim();

    const where: any = { merchantId: merchant.id, deletedAt: null };
    if (status) where.status = status;
    if (search) {
      // Offer selector search: title-only, case-insensitive, capped at 10.
      where.title = { contains: search, mode: "insensitive" };
    } else if (q)
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { content: { is: { description: { contains: q, mode: "insensitive" } } } },
      ];
    if (scope === "history") {
      where.status = { in: ["REPLACED", "EXPIRED", "ARCHIVED"] };
    } else if (scope === "drafts") {
      where.status = { in: ["DRAFT", "VALIDATION_FAILED"] };
    } else if (scope === "archived") {
      where.status = "ARCHIVED";
    }

    const take = search ? Math.min(pageSize, 10) : pageSize;

    const [offers, total, currentLive] = await Promise.all([
      prisma.merchantOffer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take,
        select: {
          id: true,
          title: true,
          status: true,
          offerType: true,
          startDate: true,
          endDate: true,
          _count: { select: { redemptions: true } },
          replacesOffer: { select: { id: true, title: true } },
          pricing: { select: { configuration: true } },
          capacity: { select: { redeemedCount: true, maxRedemptions: true } },
          content: { select: { imageUrls: true } }
        },
      }),
      prisma.merchantOffer.count({ where }),
      prisma.merchantOffer.findFirst({
        where: { merchantId: merchant.id, status: "LIVE", deletedAt: null },
        select: {
          id: true,
          title: true,
          status: true,
          offerType: true,
          pricing: { select: { configuration: true } },
        },
      }),
    ]);

    const pendingReplacement = currentLive
      ? await prisma.merchantOffer.findFirst({
          where: {
            merchantId: merchant.id,
            replacesOfferId: currentLive.id,
            deletedAt: null,
            status: {
              in: [
                "VALIDATION_IN_PROGRESS",
                "AWAITING_APPROVAL",
                "VALIDATION_FAILED",
                "CHANGES_REQUESTED",
              ],
            },
          },
          select: {
            id: true,
            title: true,
            status: true,
            offerType: true,
            createdAt: true,
            submittedAt: true,
            pricing: { select: { configuration: true } },
            review: { select: { reviewNotes: true, rejectionReason: true } },
          },
        })
      : null;

    const pendingReplacementRequest = pendingReplacement
      ? await prisma.offerReplacementRequest.findFirst({
          where: { newOfferId: pendingReplacement.id },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    return NextResponse.json({
      success: true,
      data: offers,
      currentLive,
      pendingReplacement,
      pendingReplacementRequest,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    return internalError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const merchant = await getMerchantFromSession();
    if (!merchant) return unauthorized();

    const body = await request.json();
    console.log("[MERCHANT OFFERS POST] Incoming body keys:", Object.keys(body));
    console.log("[MERCHANT OFFERS POST] redemptionType:", body.redemptionType);
    console.log("[MERCHANT OFFERS POST] saveAsDraft:", body.saveAsDraft);
    console.log("[MERCHANT OFFERS POST] replacesOfferId:", body.replacesOfferId);

    const {
      title,
      description,
      shortDescription,
      termsAndConditions,
      imageUrls,
      offerType,
      discountValue,
      discountMax,
      discountPercent,
      minimumSpend,
      isFeatured,
      isExclusive,
      maxRedemptions,
      startDate,
      endDate,
      daysOfWeek,
      redemptionCode,
      redemptionInstructions,
      categoryId,
      submissionNotes,
      replacesOfferId,
      replacementReason,
      saveAsDraft,
      redemptionType,
      bookingUrl,
      buyQuantity,
      buyItem,
      getQuantity,
      freeItem,
      maxFreeItems,
    } = body;

    if (!title || !offerType || !startDate || !endDate) {
      return badRequest(
        "Missing required fields: title, offerType, startDate, endDate",
      );
    }

    if (redemptionType && !VALID_REDEMPTION_TYPES.includes(redemptionType)) {
      return badRequest(
        `Invalid redemptionType. Must be one of: ${VALID_REDEMPTION_TYPES.join(', ')}`,
      );
    }

    if (redemptionType === 'ONLINE_CODE' && !bookingUrl && !saveAsDraft) {
      return badRequest("Booking URL is required for ONLINE_CODE offers");
    }
    if (redemptionType === 'BOOKING_LINK' && !bookingUrl && !saveAsDraft) {
      return badRequest("Booking URL is required for BOOKING_LINK offers");
    }

    // ── Validation reads: these gate creation, so they stay awaited.
    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_CATEGORY", message: "Selected category does not exist." } },
          { status: 400 },
        );
      }
    }

    const isDuplicate = await checkDuplicateOffer(merchant.id, title);
    if (isDuplicate) {
      return badRequest(
        "An offer with this title already exists (live, awaiting approval, or in review)",
      );
    }

    if (replacesOfferId) {
      try {
        await validateReplacement(prisma, {
          merchantId: merchant.id,
          targetOfferId: replacesOfferId,
        });
      } catch (err) {
        if (err instanceof ReplacementValidationError) {
          return NextResponse.json(
            { success: false, error: { code: err.code, message: err.message } },
            { status: 400 },
          );
        }
        throw err;
      }
    }

    if (saveAsDraft) {
      const existingDraft = await prisma.merchantOffer.findFirst({
        where: {
          merchantId: merchant.id,
          deletedAt: null,
          status: { in: ['DRAFT', 'VALIDATION_FAILED', 'CHANGES_REQUESTED'] },
          id: { not: body.excludeId ?? '' },
        },
      });
      if (existingDraft) {
        return badRequest('You already have a pending draft. Please submit or delete it before creating a new one.');
      }
    }

    let qcResult = { passed: true, errors: {} as Record<string, string> };
    if (!saveAsDraft) {
      qcResult = runQualityChecks(body);
    }

    console.log('[MERCHANT OFFERS POST] qcResult.passed:', qcResult.passed);

    const targetStatus = saveAsDraft
      ? "DRAFT"
      : qcResult.passed
        ? "AWAITING_APPROVAL"
        : "VALIDATION_FAILED";

    // Offer code generation is needed to build the redemption config inside
    // the transaction below, so it must stay synchronous/awaited.
    let offerCodeValue: string | null = null;
    if (redemptionType === 'ONLINE_CODE' || redemptionType === 'VIRTUAL_CARD_AUTO_VERIFY') {
      offerCodeValue = await generateUniqueOfferCode();
    }

    // ── Step 1: create the record. Nothing here is optional — if this
    // fails, the client correctly gets an error.
    const offer = await prisma.$transaction(async (tx) => {
      const created = await tx.merchantOffer.create({
        data: {
          merchantId: merchant.id,
          categoryId: categoryId ?? null,
          title,
          offerType,
          isFeatured: !!isFeatured,
          isExclusive: !!isExclusive,
          // redemption: redemptionType ?? null,
          status: targetStatus,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          submittedAt: saveAsDraft ? null : new Date(),
          replacesOfferId: replacesOfferId ?? null,
        },
      });

      await tx.offerContent.create({
        data: {
          offerId: created.id,
          shortDescription: shortDescription ?? null,
          description: description ?? null,
          termsAndConditions: termsAndConditions ?? null,
          imageUrls: imageUrls ?? [],
          displayData: undefined,
        },
      });

      const pricingConfig: Record<string, unknown> = {};
      if (offerType === 'flat_rate') {
        pricingConfig.amount = Number(discountValue) || 0;
        if (minimumSpend != null) pricingConfig.minimumSpend = Number(minimumSpend);
      } else if (offerType === 'percentage') {
        pricingConfig.percent = Number(discountPercent) || 0;
        if (discountMax != null) pricingConfig.maximumDiscount = Number(discountMax);
        if (minimumSpend != null) pricingConfig.minimumSpend = Number(minimumSpend);
      } else if (offerType === 'buy_x_get_y') {
        pricingConfig.buyQuantity = Number(buyQuantity) || 0;
        pricingConfig.buyItem = buyItem ?? '';
        pricingConfig.getQuantity = Number(getQuantity) || 0;
        pricingConfig.freeItem = freeItem ?? '';
        if (maxFreeItems != null) pricingConfig.maxFreeItems = Number(maxFreeItems);
      }

      await tx.offerPricing.create({
        data: {
          offerId: created.id,
          pricingType: offerType,
          configuration: pricingConfig as any,
        },
      });

      const redemptionConfig: Record<string, unknown> = {};
      if (redemptionType === 'ONLINE_CODE') {
        redemptionConfig.code = redemptionCode ?? offerCodeValue;
        redemptionConfig.bookingUrl = bookingUrl ?? null;
        redemptionConfig.instructions = redemptionInstructions ?? null;
      } else if (redemptionType === 'BOOKING_LINK') {
        redemptionConfig.bookingUrl = bookingUrl ?? null;
        redemptionConfig.instructions = redemptionInstructions ?? null;
      } else if (redemptionType === 'IN_STORE_QR') {
        redemptionConfig.instructions = redemptionInstructions ?? null;
      } else if (redemptionType === 'VIRTUAL_CARD_AUTO_VERIFY') {
        redemptionConfig.code = offerCodeValue;
        redemptionConfig.instructions = redemptionInstructions ?? null;
      }

      await tx.offerRedemption.create({
        data: {
          offerId: created.id,
          redemptionType: redemptionType ?? null,
          configuration: Object.keys(redemptionConfig).length > 0 ? (redemptionConfig as any) : null,
          maxRedemptions: maxRedemptions ?? null,
          currentRedemptions: 0,
          daysOfWeek: daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
        },
      });

      await tx.offerRedemptionCapacity.create({
        data: {
          offerId: created.id,
          maxRedemptions: maxRedemptions ?? null,
          redeemedCount: 0,
        },
      });

      await tx.offerReview.create({
        data: {
          offerId: created.id,
          submissionNotes: submissionNotes ?? null,
          replacementReason: replacementReason ?? null,
          isReplacement: !!replacesOfferId,
          validationErrors: qcResult.passed ? null : (qcResult.errors as any),
        },
      });

      await tx.offerAnalytics.create({
        data: {
          offerId: created.id,
          saveCount: 0,
          viewCount: 0,
        },
      });

      return created;
    }, { timeout: 15000, maxWait: 5000 });

    console.log('** Created offer with ID:', offer.id, 'Status:', offer.status);

    // ── Step 2: build the response NOW. Everything below this point —
    // notifications, action queue items, replacement audit, offer-code
    // audit log, final audit log — is side-effect work the merchant does
    // not need to wait for.
    const response = NextResponse.json(
      {
        success: true,
        data: offer,
        qualityCheck: qcResult.passed ? "PASSED" : "FAILED",
        validationErrors: qcResult.errors,
      },
      { status: 201 },
    );

    // ── Step 3: fire notifications + audit log WITHOUT awaiting.
    // Intentionally not `await`ed — errors are caught internally inside
    // firePostCreateSideEffects and never affect the response above.
    if (offerCodeValue) {
      void createAuditLog({
        actorType: 'merchant',
        actorId: merchant.id,
        action: "OFFER_CODE_GENERATED",
        entityType: "MERCHANT_OFFER",
        entityId: offer.id,
        metadata: { offerCode: offerCodeValue, redemptionType },
      }).catch((err) => console.error('[MERCHANT OFFERS POST] Offer code audit log failed:', err));
    }

    void firePostCreateSideEffects({
      saveAsDraft: !!saveAsDraft,
      qcPassed: qcResult.passed,
      qcErrors: qcResult.errors,
      offerId: offer.id,
      title,
      merchantId: merchant.id,
      merchantBusinessName: merchant.businessName,
      replacesOfferId: replacesOfferId ?? null,
      replacementReason: replacementReason ?? null,
      redemptionType: redemptionType ?? null,
      offerCodeValue,
    });

    return response;
  } catch (error) {
    return internalError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const merchant = await getMerchantFromSession();
    if (!merchant) return unauthorized();

    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids');
    if (!ids) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'Offer IDs are required' } },
        { status: 400 },
      );
    }

    const idList = ids.split(',').filter(Boolean);
    if (idList.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'At least one offer ID is required' } },
        { status: 400 },
      );
    }

    const deletableStatuses = ['DRAFT', 'VALIDATION_FAILED', 'REJECTED', 'EXPIRED', 'REPLACED', 'AWAITING_APPROVAL', 'ARCHIVED'];

    const offers = await prisma.merchantOffer.findMany({
      where: { id: { in: idList }, merchantId: merchant.id },
    });

    const invalid = offers.filter((o) => !deletableStatuses.includes(o.status));
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Cannot delete ${invalid.length} offer(s) — live offers must be replaced instead`,
          },
        },
        { status: 403 },
      );
    }

    const offerIds = offers.map(o => o.id);

    await prisma.merchantOffer.updateMany({
      where: { id: { in: offerIds }, merchantId: merchant.id },
      data: {
        deletedAt: new Date(),
        deletedById: merchant.id,
        deletedByRole: 'merchant',
      },
    });

    // Fire-and-forget: audit logs for deletion don't need to block the response.
    void Promise.all(
      offers.map((offer) =>
        createAuditLog({
          actorType: 'merchant',
          actorId: merchant.id,
          action: 'OFFER_DELETED',
          entityType: 'MERCHANT_OFFER',
          entityId: offer.id,
          metadata: { title: offer.title, previousStatus: offer.status },
        }),
      ),
    ).catch((err) => console.error('[MERCHANT OFFERS DELETE] Audit log failed:', err));

    return NextResponse.json({ success: true, deleted: offers.length });
  } catch (error) {
    return internalError(error);
  }
}