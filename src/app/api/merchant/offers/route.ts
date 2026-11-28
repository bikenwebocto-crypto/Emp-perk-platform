import { notEndedBy } from '@/lib/offers/end-date';
import { categoryLockError } from '@/lib/offers/category-lock'
import { selectableCategoryWhere } from '@/lib/categories'
import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  channelRedemptionType,
  channelRedemptionTypes,
  parseBranchSelection,
  withBranchSelection,
  withChannelDetails,
} from "@/lib/offers/channel";
import { requiredBranchesError, validateBranchSelection } from "@/lib/offers/channel.server";
import { MISSING_BRANCHES_CODE } from "@/lib/offers/channel";
import { getMerchantFromSession } from '@/lib/merchant-session'
import { OfferStatus, Prisma } from "@prisma/client";
import {
  ReplacementValidationError,
  validateReplacement,
} from "@/lib/offer-replacement";
import { logReplacementAudit, notifyReplacement } from "@/lib/offer-replacement-notifications";
import { createAuditLog } from '@/services/audit-log.service';
import {
  generateUniqueOfferCode,
  isPromoCodeTakenByLiveOffer,
  isValidOfferCode,
  PROMO_CODE_TAKEN_MESSAGE,
} from '@/lib/offer-code';
import { parseRepeatAfterHoursInput } from '@/lib/redemption-tracking';
import { validateFlashWindow } from '@/lib/offers/flash';
import {
  firstFlatDiscountError,
  firstPercentDiscountError,
  isFlatOfferType,
  isPercentOfferType,
  validateFlatDiscount,
  validatePercentDiscount,
} from '@/lib/offers/flat-discount';
import {
  EVERGREEN_LIVE_MESSAGE,
  EVERGREEN_REPLACE_CONFIRM_CODE,
  EVERGREEN_REPLACE_CONFIRM_MESSAGE,
  EvergreenActivationError,
  assertEvergreenActivationAllowed,
  findLiveEvergreen,
  isEvergreenOffer,
  isEvergreenRange,
  isForeverOffer,
  shouldAutoActivateEvergreen,
  validateMerchantForeverOfferPolicy,
} from '@/lib/offers/evergreen';
import { notifyEvergreenBroadcast, notifyEvergreenMerchant } from '@/lib/offers/evergreen-notifications';
import * as mail from '@/emails/templates/merchant';
import { merchantEmailBase } from '@/lib/merchant-emails';
import { ensureOfferQRCode } from '@/lib/offer-qr';
import { BUSINESS_NOTIFICATION_TEMPLATES, channels, collectEmailWarnings, publishBusinessNotification, publishBusinessToAdmins } from '@/services/business-notification.service';
import { triggerOfferExpiry } from '@/lib/offer-expiry-trigger'
import { offerStatusRank } from '@/lib/offers/status-order'

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

function badRequest(message: string, field?: string) {
  return NextResponse.json(
    {
      success: false,
      error: { code: "VALIDATION", message, ...(field ? { field } : {}) },
    },
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

  if (body.redemptionType === 'ONLINE_CODE') {
    if (!String(body.redemptionCode ?? '').trim()) {
      errors.redemptionCode = 'Offer code is required';
    } else if (!isValidOfferCode(String(body.redemptionCode).trim())) {
      errors.redemptionCode = '3 to 13 letters and numbers';
    }
  }
  if (!body.startDate) errors.startDate = "Start date is required";
  if (!body.endDate && !body.isForever) errors.endDate = "End date is required";
  if (
    body.startDate &&
    body.endDate &&
    new Date(body.endDate) <= new Date(body.startDate)
  ) {
    errors.endDate = "End date must be after start date";
  }
  const flashError = validateFlashWindow(body.isFlash, body.startDate, body.endDate);
  if (flashError && !errors.endDate) errors.endDate = flashError;
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
 * Saves the offer-code audit row, the approval or replacement request and the
 * submission audit row. Runs inside the create transaction so the offer can't
 * be saved without them.
 */
async function recordOfferCreate(
  tx: Prisma.TransactionClient,
  params: {
    saveAsDraft: boolean;
    qcPassed: boolean;
    offerId: string;
    title: string;
    merchantId: string;
    merchantBusinessName: string;
    replacesOfferId: string | null;
    replacementReason: string | null;
    redemptionType: string | null;
    offerCodeValue: string | null;
    autoActivated: boolean;
    replacedOfferId: string | null;
  },
) {
  const {
    saveAsDraft, qcPassed, offerId, title, merchantId, merchantBusinessName,
    replacesOfferId, replacementReason, redemptionType, offerCodeValue,
    autoActivated, replacedOfferId,
  } = params;

  if (offerCodeValue) {
    await createAuditLog({
      actorType: 'merchant',
      actorId: merchantId,
      action: "OFFER_CODE_GENERATED",
      entityType: "MERCHANT_OFFER",
      entityId: offerId,
      metadata: { offerCode: offerCodeValue, redemptionType },
    }, tx);
  }

  if (autoActivated) {
    await createAuditLog({
      actorType: 'merchant',
      actorId: merchantId,
      action: "EVERGREEN_OFFER_AUTO_ACTIVATED",
      entityType: "MERCHANT_OFFER",
      entityId: offerId,
      metadata: {
        title,
        redemptionType: redemptionType ?? null,
        offerCode: offerCodeValue ?? null,
        replacedOfferId,
      },
    }, tx);
    if (replacedOfferId) {
      // Evidence on the replaced offer itself, so its own history shows why it left LIVE.
      await createAuditLog({
        actorType: 'merchant',
        actorId: merchantId,
        action: "OFFER_REPLACED",
        entityType: "MERCHANT_OFFER",
        entityId: replacedOfferId,
        changes: { status: { from: 'LIVE', to: 'REPLACED' } },
        metadata: { replacedByOfferId: offerId, reason: 'evergreen_auto_activation' },
      }, tx);
    }
    return;
  }

  if (saveAsDraft || !qcPassed) return;

  if (replacesOfferId) {
    await tx.offerReplacementRequest.create({
      data: {
        currentOfferId: replacesOfferId,
        newOfferId: offerId,
        status: "AWAITING_APPROVAL",
        reason: replacementReason ?? null,
      },
    });
    await tx.actionQueueItem.create({
      data: {
        type: "OFFER_REPLACEMENT",
        title: `Offer Replacement: ${title}`,
        description: `Merchant ${merchantBusinessName} submitted a replacement offer`,
        referenceId: merchantId,
        merchantId,
        referenceType: "merchant",
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
    }, tx);
  } else {
    // A brand-new offer can't already have a queue item, so no duplicate check is needed.
    await tx.actionQueueItem.create({
      data: {
        type: "FIRST_OFFER_APPROVAL",
        title: `Offer Approval: ${title}`,
        description: `Merchant ${merchantBusinessName} submitted an offer for approval`,
        referenceId: merchantId,
        merchantId,
        referenceType: "merchant",
        status: "PENDING",
        priority: 1,
        metadata: { offerId },
      },
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
  }, tx);
}

/**
 * Everything here is side-effect / notification work that the
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
  autoActivated: boolean;
  replacedOfferId?: string | null;
  replacedOfferTitle?: string | null;
}) {
  const {
    saveAsDraft, qcPassed, qcErrors, offerId, title,
    merchantId, merchantBusinessName, replacesOfferId,
    replacementReason, redemptionType, offerCodeValue, autoActivated,
    replacedOfferId = null, replacedOfferTitle = null,
  } = params;

  try {
    // Evergreen auto-activation: no action-queue item, no admin approval —
    // the offer is already LIVE. Notify the merchant and all users.
    if (autoActivated) {
      if (redemptionType === 'IN_STORE_QR') {
        ensureOfferQRCode(offerId).catch((err) =>
          console.error('[MERCHANT OFFERS POST] Evergreen QR generation failed:', err),
        );
      }
      // The merchant notice was already sent (awaited) before the response.
      await notifyEvergreenBroadcast({ offerId, title, merchantId });
      return;
    }

    if (!saveAsDraft && !qcPassed) {
      const template = BUSINESS_NOTIFICATION_TEMPLATES.offerValidationFailed(title);
      await publishBusinessNotification({
        ...template,
        recipients: [{ role: 'merchant', id: merchantId }],
        channels: channels('IN_APP', 'EMAIL'),
        referenceType: 'merchant_offer',
        referenceId: offerId,
        metadata: { validationErrors: qcErrors },
        // Spec M-06 Offer failed checks.
        email: mail.m06OfferFailedChecks({
          ...(await merchantEmailBase(merchantId)),
          offerId,
          offerTitle: title,
          failedRule: Object.values(qcErrors).join(' ') || 'The offer did not pass our automatic checks.',
        }),
      });
      return;
    }

    if (saveAsDraft || !qcPassed) return;

    if (replacesOfferId) {
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
      const template = BUSINESS_NOTIFICATION_TEMPLATES.offerSubmitted(title);
      await publishBusinessToAdmins({
        ...template,
        channels: channels('IN_APP', 'PUSH'),
        referenceType: 'merchant_offer',
        referenceId: offerId,
        metadata: { merchantId },
      });
    }
  } catch (err) {
    // Never let a notification/audit failure surface to the client —
    // the offer record itself already saved and committed successfully.
    console.error('[MERCHANT OFFERS POST] Post-create side effect failed:', err);
  }
}

export async function GET(request: NextRequest) {
  try {
    triggerOfferExpiry() // background, never awaited
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
    } else if (scope === "flash") {
      where.isFlash = true;
      where.status = { notIn: ["ARCHIVED"] };
    }

    const take = search ? Math.min(pageSize, 10) : pageSize;

    const [allOffers, total, currentLive, liveForPolicy] = await Promise.all([
      prisma.merchantOffer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          offerType: true,
          isFlash: true,
          startDate: true,
          endDate: true,
          updatedAt: true,
          submittedAt: true,
          redemption: { select: { redemptionType: true, configuration: true } },
          _count: { select: { redemptions: true } },
          replacesOffer: { select: { id: true, title: true } },
          analytics: { select: { viewCount: true, saveCount: true } },
          pricing: { select: { configuration: true } },
          capacity: { select: { redeemedCount: true, maxRedemptions: true } },
          content: { select: { imageUrls: true } },
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
      prisma.merchantOffer.findMany({
        where: {
          merchantId: merchant.id,
          status: "LIVE",
          startDate: { lte: new Date() },
          AND: [notEndedBy(new Date())],
          deletedAt: null,
        },
        select: { startDate: true, endDate: true, isForever: true, isFlash: true },
      }),
    ]);

    // Flash/Regular offers can only be created while a live Evergreen exists.
    // Only an Evergreen that is LIVE and inside its validity window qualifies.
    const hasLiveForever = liveForPolicy.some(isForeverOffer);

    // Status lifecycle first (Live → in review → needs action → ended), then
    // Evergreen > flash > normal. Array.sort is stable, so the createdAt desc
    // order is preserved inside each group.
    const typeRank = (o: { evergreen: boolean; isFlash: boolean }) =>
      o.evergreen ? 0 : o.isFlash ? 1 : 2;

    const offers = allOffers
      .map((o) => ({ ...o, evergreen: isEvergreenRange(o.startDate, o.endDate) }))
      .sort((a, b) => offerStatusRank(a.status) - offerStatusRank(b.status) || typeRank(a) - typeRank(b))
      .slice((page - 1) * pageSize, (page - 1) * pageSize + take);

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
      hasLiveForever,
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
    if (typeof body?.redemptionCode === "string") body.redemptionCode = body.redemptionCode.trim().toUpperCase(); // ME-15
    if (body?.saveAsDraft) { // ME-10: drafts may be incomplete; fill schema-required columns
      if (!String(body.title ?? "").trim()) body.title = "Untitled draft";
      if (!body.offerType) body.offerType = "percentage";
      if (!body.startDate) body.startDate = new Date().toISOString();
    }
    const categoryLock = categoryLockError(body.categoryId, merchant.categoryId);
    if (categoryLock) return categoryLock;
    const assignedCategory = merchant.categoryId
      ? await prisma.category.findFirst({
          where: { id: merchant.categoryId, ...selectableCategoryWhere },
          select: { id: true },
        })
      : null;
    if (!assignedCategory && !body.saveAsDraft) {
      return NextResponse.json(
        { success: false, error: { code: "MISSING_CATEGORY", message: "Your business category must be assigned from the active platform categories before submitting an offer." } },
        { status: 400 },
      );
    }
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
      isFlash,
      isForever,
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
      confirmReplaceEvergreen,
      redemptionType: requestedRedemptionType,
      bookingUrl,
      buyQuantity,
      buyItem,
      getQuantity,
      freeItem,
      maxFreeItems,
    } = body;

    // Channel (In-store / Online / Both) + branches; the channel decides redemptionType.
    const branchSelection = parseBranchSelection(body);
    if (!branchSelection.ok) return badRequest(branchSelection.error);
    const redemptionType = branchSelection.value
      ? channelRedemptionType(branchSelection.value.channel)
      : requestedRedemptionType;
    if (branchSelection.value) {
      const branchError = await validateBranchSelection(merchant.id, branchSelection.value, {
        forSubmit: !saveAsDraft,
      });
      if (branchError) return badRequest(branchError);
      if (!saveAsDraft) {
        const missing = await requiredBranchesError(merchant.id, branchSelection.value.channel);
        if (missing) {
          return NextResponse.json(
            { success: false, error: { code: MISSING_BRANCHES_CODE, message: missing, field: "channel" } },
            { status: 400 },
          );
        }
      }
    }

    if (!saveAsDraft && (!title || !offerType || !startDate || (!endDate && !isForever))) {
      return badRequest(
        "Missing required fields: title, offerType, startDate, endDate (except Evergreen offers)",
      );
    }

    if (redemptionType && !VALID_REDEMPTION_TYPES.includes(redemptionType)) {
      return badRequest(
        `Invalid redemptionType. Must be one of: ${VALID_REDEMPTION_TYPES.join(', ')}`,
      );
    }

    const repeatAfterHours = parseRepeatAfterHoursInput(body.repeatAfterHours);
    if (!repeatAfterHours.ok) {
      return badRequest("repeatAfterHours must be a positive number");
    }

    // Hard business rule for flat offers: 0 < discount < minimum spend.
    // Drafts may leave fields empty, but never save an invalid combination.
    if (isFlatOfferType(body.offerType)) {
      const flatError = firstFlatDiscountError(
        validateFlatDiscount(
          { discountValue: body.discountValue, minimumSpend: body.minimumSpend },
          { requireAll: !saveAsDraft },
        ),
      );
      if (flatError) return badRequest(flatError);
    }
    if (isPercentOfferType(body.offerType)) {
      const pctError = firstPercentDiscountError(
        validatePercentDiscount(
          {
            discountPercent: body.discountPercent,
            minimumSpend: body.minimumSpend,
            discountMax: body.discountMax,
          },
          { requireAll: !saveAsDraft },
        ),
      );
      if (pctError) return badRequest(pctError);
    }

    const computedIsForever = Boolean(isForever) || isEvergreenRange(startDate, endDate);

    if (redemptionType === 'ONLINE_CODE' && !bookingUrl && !saveAsDraft) {
      return badRequest("Booking URL is required for ONLINE_CODE offers");
    }
    if (
      redemptionType === 'ONLINE_CODE' &&
      typeof redemptionCode === 'string' &&
      redemptionCode.trim() &&
      !isValidOfferCode(redemptionCode.trim())
    ) {
      // Drafts skip runQualityChecks, so the format rule must be enforced here too.
      return badRequest("3 to 13 letters and numbers", "redemptionCode");
    }
    if (redemptionType === 'ONLINE_CODE' && !saveAsDraft && !String(redemptionCode ?? '').trim()) {
      return badRequest("Offer code is required for ONLINE_CODE offers", "redemptionCode");
    }
    if (
      redemptionType === 'ONLINE_CODE' &&
      String(redemptionCode ?? '').trim() &&
      (await isPromoCodeTakenByLiveOffer(String(redemptionCode)))
    ) {
      return badRequest(PROMO_CODE_TAKEN_MESSAGE, "redemptionCode");
    }
    if (redemptionType === 'BOOKING_LINK' && !bookingUrl && !saveAsDraft) {
      return badRequest("Booking URL is required for BOOKING_LINK offers");
    }

    // ── Validation reads: these gate creation, so they stay awaited.
    if (categoryId) {
      const category = await prisma.category.findFirst({ where: { id: categoryId, ...selectableCategoryWhere } });
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

    if (!saveAsDraft) {
      const liveOffers = await prisma.merchantOffer.findMany({
        where: {
          merchantId: merchant.id,
          status: "LIVE",
          AND: [notEndedBy(new Date())],
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
          isFlash: true,
          isForever: true,
          replacesOfferId: true,
        },
      });

      // One LIVE Evergreen per account. A new Evergreen while one is LIVE
      // needs the merchant's explicit confirmation (popup); once confirmed,
      // the current one is deactivated and the new one goes LIVE.
      const upcomingIsEvergreen = isEvergreenOffer({
        isForever: computedIsForever,
        isFlash: !!isFlash,
        startDate,
        endDate,
      });
      const currentEvergreen =
        upcomingIsEvergreen && !replacesOfferId ? findLiveEvergreen(liveOffers) : null;
      if (currentEvergreen && !confirmReplaceEvergreen) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: EVERGREEN_REPLACE_CONFIRM_CODE,
              message: EVERGREEN_REPLACE_CONFIRM_MESSAGE,
              currentOffer: { id: currentEvergreen.id, title: currentEvergreen.title },
            },
          },
          { status: 409 },
        );
      }

      const evergreenError = validateMerchantForeverOfferPolicy({
        liveOffers,
        upcomingOffer: {
          id: null,
          startDate: startDate,
          endDate: endDate,
          isForever: computedIsForever,
          isFlash: !!isFlash,
        },
        isReplacement: !!replacesOfferId || !!currentEvergreen,
        replacementTargetId: replacesOfferId ?? currentEvergreen?.id ?? null,
      });

      if (evergreenError) {
        return badRequest(evergreenError);
      }
    }

    if (saveAsDraft) {
      const existingDraft = await prisma.merchantOffer.findFirst({
        where: {
          merchantId: merchant.id,
          deletedAt: null,
          status: { in: ['DRAFT', 'VALIDATION_FAILED', 'CHANGES_REQUESTED'] },
          // id is a uuid column: '' is not a valid uuid, so only filter when set.
          ...(body.excludeId ? { id: { not: body.excludeId } } : {}),
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

    // Evergreen (non-replacement) submissions go LIVE without admin approval.
    // Flash / Regular / replacements keep the existing approval workflow.
    // Status is always derived server-side — any client `status` is ignored.
    const autoActivate =
      !saveAsDraft &&
      shouldAutoActivateEvergreen({
        qcPassed: qcResult.passed,
        isReplacement: !!replacesOfferId,
        offer: { isForever: computedIsForever, isFlash: !!isFlash, startDate, endDate },
      });

    const targetStatus = saveAsDraft
      ? "DRAFT"
      : !qcResult.passed
        ? "VALIDATION_FAILED"
        : autoActivate
          ? "LIVE"
          : "AWAITING_APPROVAL";
    const activatedAt = new Date();

    // Offer code generation is needed to build the redemption config inside
    // the transaction below, so it must stay synchronous/awaited.
    let offerCodeValue: string | null = null;
    if (redemptionType === 'ONLINE_CODE' || redemptionType === 'VIRTUAL_CARD_AUTO_VERIFY') {
      offerCodeValue = await generateUniqueOfferCode();
    }

    // ── Step 1: create the record. Nothing here is optional — if this
    // fails, the client correctly gets an error.
    let replacedEvergreen: { replacedOfferId: string | null; replacedOfferTitle: string | null } = {
      replacedOfferId: null,
      replacedOfferTitle: null,
    };
    const offer = await prisma.$transaction(async (tx) => {
      if (autoActivate) {
        // Locks the merchant row and re-checks against committed data, so two
        // concurrent Evergreen submissions can't both go LIVE. With the
        // merchant's confirmation, the current LIVE Evergreen is set REPLACED.
        replacedEvergreen = await assertEvergreenActivationAllowed(tx, merchant.id, null, {
          confirmReplace: !!confirmReplaceEvergreen,
        });
      }
      const created = await tx.merchantOffer.create({
        data: {
          merchantId: merchant.id,
          categoryId: merchant.categoryId ?? null,
          title,
          offerType,
          isFeatured: !!isFeatured,
          isExclusive: !!isExclusive,
          isFlash: !!isFlash,
          isForever: computedIsForever,
          // redemption: redemptionType ?? null,
          status: targetStatus,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          submittedAt: saveAsDraft ? null : new Date(),
          ...(autoActivate ? { liveAt: activatedAt } : {}),
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
      if (repeatAfterHours.value != null) {
        redemptionConfig.repeatAfterHours = repeatAfterHours.value;
      }
      const finalRedemptionConfig = branchSelection.value
        ? withChannelDetails(withBranchSelection(redemptionConfig, branchSelection.value))
        : redemptionConfig;

      await tx.offerRedemption.create({
        data: {
          offerId: created.id,
          redemptionType: redemptionType ?? null,
          redemptionTypes: branchSelection.value
            ? channelRedemptionTypes(branchSelection.value.channel)
            : redemptionType
              ? [redemptionType]
              : [],
          configuration:
            Object.keys(finalRedemptionConfig).length > 0 ? (finalRedemptionConfig as any) : null,
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

      // Queue items and audit rows are saved with the offer, not after the response.
      await recordOfferCreate(tx, {
        saveAsDraft: !!saveAsDraft,
        qcPassed: qcResult.passed,
        offerId: created.id,
        title,
        merchantId: merchant.id,
        merchantBusinessName: merchant.businessName,
        replacesOfferId: replacesOfferId ?? null,
        replacementReason: replacementReason ?? null,
        redemptionType: redemptionType ?? null,
        offerCodeValue,
        autoActivated: autoActivate,
        replacedOfferId: replacedEvergreen.replacedOfferId,
      });

      return created;
    }, { timeout: 15000, maxWait: 5000 });

    console.log('** Created offer with ID:', offer.id, 'Status:', offer.status);

    // Evergreen go-live: the merchant notice (and first-time email) is awaited
    // so a failed email can be reported back as `emailWarnings`.
    const emailWarnings = autoActivate
      ? collectEmailWarnings(await notifyEvergreenMerchant({
          offerId: offer.id,
          title,
          merchantId: merchant.id,
          replacedOfferId: replacedEvergreen.replacedOfferId,
          replacedOfferTitle: replacedEvergreen.replacedOfferTitle,
        }))
      : [];

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
        autoActivated: autoActivate,
        ...(autoActivate ? { message: EVERGREEN_LIVE_MESSAGE } : {}),
        emailWarnings,
      },
      { status: 201 },
    );

    // ── Step 3: fire notifications WITHOUT awaiting. Errors are caught inside
    // firePostCreateSideEffects and never affect the response above.
    // after() keeps the work alive past the response on serverless hosts.
    after(() => firePostCreateSideEffects({
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
      autoActivated: autoActivate,
      replacedOfferId: replacedEvergreen.replacedOfferId,
      replacedOfferTitle: replacedEvergreen.replacedOfferTitle,
    }));

    return response;
  } catch (error) {
    if (error instanceof EvergreenActivationError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: error.code, message: error.message, currentOffer: error.currentOffer },
        },
        { status: 409 },
      );
    }
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

    const deletableStatuses = ['DRAFT'];

    const offers = await prisma.merchantOffer.findMany({
      where: { id: { in: idList }, merchantId: merchant.id },
    });

    const invalid = offers.filter((o) => !deletableStatuses.includes(o.status) || o.liveAt);
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

    await prisma.$transaction(async (tx) => {
      await tx.merchantOffer.updateMany({
        where: { id: { in: offerIds }, merchantId: merchant.id },
        data: {
          deletedAt: new Date(),
          deletedById: merchant.id,
          deletedByRole: 'merchant',
        },
      });

      // Sequential: a transaction client runs one query at a time.
      for (const offer of offers) {
        await createAuditLog({
          actorType: 'merchant',
          actorId: merchant.id,
          action: 'OFFER_DELETED',
          entityType: 'MERCHANT_OFFER',
          entityId: offer.id,
          metadata: { title: offer.title, previousStatus: offer.status },
        }, tx);
      }
    });

    return NextResponse.json({ success: true, deleted: offers.length });
  } catch (error) {
    return internalError(error);
  }
}
