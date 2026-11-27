import { categoryLockError } from '@/lib/offers/category-lock'
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMerchantFromSession } from '@/lib/merchant-session'
import { Prisma } from "@prisma/client";
import {
  clampOfferCodeLength,
  generateUniqueOfferCode,
  isPromoCodeTakenByLiveOffer,
  isValidOfferCode,
  PROMO_CODE_TAKEN_MESSAGE,
} from '@/lib/offer-code';
import { isEvergreenRange } from '@/lib/offers/evergreen';
import {
  branchSelectionFromConfig,
  channelRedemptionType,
  channelRedemptionTypes,
  parseBranchSelection,
  withBranchSelection,
  withChannelDetails,
} from '@/lib/offers/channel';
import { validateBranchSelection } from '@/lib/offers/channel.server';
import {
  firstFlatDiscountError,
  firstPercentDiscountError,
  isFlatOfferType,
  isPercentOfferType,
  validateFlatDiscount,
  validatePercentDiscount,
} from '@/lib/offers/flat-discount';
import { getRepeatAfterHours, parseRepeatAfterHoursInput, withRepeatAfterHours } from '@/lib/redemption-tracking';
import { ensureOfferQRCode } from '@/lib/offer-qr';

import { createAuditLog } from '@/services/audit-log.service';

const EDITABLE_STATUSES = ["DRAFT", "VALIDATION_FAILED", "AWAITING_APPROVAL"];
const VALID_REDEMPTION_TYPES = ['ONLINE_CODE', 'BOOKING_LINK', 'IN_STORE_QR', 'VIRTUAL_CARD_AUTO_VERIFY'] as const;
// Only drafts that were never submitted can be deleted; everything else is kept for history.
const DELETABLE_STATUSES = ["DRAFT"];

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
    { status: 401 },
  );
}

function notFound(msg = "Offer not found") {
  return NextResponse.json(
    { success: false, error: { code: "NOT_FOUND", message: msg } },
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

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "VALIDATION", message } },
    { status: 400 },
  );
}

function internalError(error: unknown) {
  console.error("Merchant offer error:", error);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL", message: "Internal server error" } },
    { status: 500 },
  );
}

async function getOwnOffer(merchantId: string, offerId: string) {
  return prisma.merchantOffer.findFirst({
    where: { id: offerId, merchantId, deletedAt: null },
    include: {
      _count: { select: { redemptions: true } },
      content: true,
      pricing: true,
      redemption: true,
      capacity: true,
      review: true,
      analytics: true,
    },
  });
}

// Remarks super-admins added on this offer's action-queue items (first offer
// approval / replacement). Stored in actionQueueItem.metadata.remarks; the
// offer id is in metadata.offerId or metadata.newOfferId. The admin id is not
// returned to the merchant.
async function getAdminRemarks(offerId: string): Promise<{ text: string; at: string }[]> {
  const items = await prisma.actionQueueItem.findMany({
    where: {
      OR: [
        { metadata: { path: ["offerId"], equals: offerId } },
        { metadata: { path: ["newOfferId"], equals: offerId } },
      ],
    },
    select: { metadata: true },
  });
  return items
    .flatMap((item) => {
      const remarks = (item.metadata as { remarks?: unknown } | null)?.remarks;
      return Array.isArray(remarks) ? remarks : [];
    })
    .filter((r): r is { text: string; at: string } =>
      typeof r?.text === "string" && typeof r?.at === "string")
    .map((r) => ({ text: r.text, at: r.at }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const merchant = await getMerchantFromSession();
    if (!merchant) return unauthorized();
    const { id } = await params;
    const offer = await getOwnOffer(merchant.id, id);
    if (!offer) return notFound();

    const redemptionConfig = (offer.redemption?.configuration as Record<string, unknown>) ?? {}
    const qrCodeUrl = redemptionConfig.qrCodeUrl as string | undefined

    // Recovery: if LIVE IN_STORE_QR offer has no QR, generate one silently
    if (offer.status === 'LIVE' && offer.redemption?.redemptionType === 'IN_STORE_QR' && !qrCodeUrl) {
      console.log('[MERCHANT OFFERS GET] Recovery triggered — LIVE IN_STORE_QR offer missing QR code. Generating...');
      ensureOfferQRCode(offer.id).then((result) => {
        if (result) {
          console.log('[MERCHANT OFFERS GET] Recovery QR generated successfully:', result.qrUrl);
        } else {
          console.log('[MERCHANT OFFERS GET] Recovery QR generation returned null');
        }
      });
    }

    const adminRemarks = await getAdminRemarks(offer.id);

    return NextResponse.json({
      success: true,
      data: {
        ...offer,
        repeatAfterHours: getRepeatAfterHours(offer.redemption?.configuration),
        ...branchSelectionFromConfig(
          offer.redemption?.redemptionType,
          offer.redemption?.configuration,
        ),
        adminRemarks,
      },
    });
  } catch (error) {
    return internalError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const merchant = await getMerchantFromSession();
    if (!merchant) return unauthorized();
    const { id } = await params;
    const existing = await getOwnOffer(merchant.id, id);
    if (!existing) return notFound();

    if (!EDITABLE_STATUSES.includes(existing.status)) {
      return forbidden("Only draft or validation-failed offers can be edited");
    }

    const body = await request.json();
    const categoryLock = categoryLockError(body.categoryId, merchant.categoryId);
    if (categoryLock) return categoryLock;

    const repeatAfterHours = parseRepeatAfterHoursInput(body.repeatAfterHours);
    if (!repeatAfterHours.ok) {
      return badRequest("repeatAfterHours must be a positive number");
    }

    if (typeof body.redemptionCode === 'string' && body.redemptionCode.trim() && !isValidOfferCode(body.redemptionCode.trim())) {
      return badRequest("3 to 13 letters and numbers");
    }
    if (
      typeof body.redemptionCode === 'string' &&
      body.redemptionCode.trim() &&
      (await isPromoCodeTakenByLiveOffer(body.redemptionCode, id))
    ) {
      return badRequest(PROMO_CODE_TAKEN_MESSAGE);
    }

    // Channel (In-store / Online / Both) + branches; the channel decides redemptionType.
    const branchSelection = parseBranchSelection(body);
    if (!branchSelection.ok) return badRequest(branchSelection.error);
    if (branchSelection.value) {
      body.redemptionType = channelRedemptionType(branchSelection.value.channel);
      const branchError = await validateBranchSelection(merchant.id, branchSelection.value, {
        // Offers already in review must stay complete; drafts may be partial.
        forSubmit: existing.status === "AWAITING_APPROVAL",
      });
      if (branchError) return badRequest(branchError);
    }

    // Validate the flat discount against the values that will actually be stored
    // (this route keeps the existing value when a field is omitted/null/empty).
    if (isFlatOfferType(body.offerType ?? existing.offerType)) {
      const cfg = (existing.pricing?.configuration as Record<string, unknown>) ?? {};
      const pick = (v: unknown, fallback: unknown) =>
        v === undefined || v === null || v === '' ? fallback : v;
      const flatError = firstFlatDiscountError(
        validateFlatDiscount(
          {
            discountValue: pick(body.discountValue, cfg.amount),
            minimumSpend: pick(body.minimumSpend, cfg.minimumSpend),
          },
          // Offers already in review must stay complete; drafts may be partial.
          { requireAll: existing.status === "AWAITING_APPROVAL" },
        ),
      );
      if (flatError) return badRequest(flatError);
    }
    if (isPercentOfferType(body.offerType ?? existing.offerType)) {
      const cfg = (existing.pricing?.configuration as Record<string, unknown>) ?? {};
      const pick = (v: unknown, fallback: unknown) =>
        v === undefined || v === null || v === '' ? fallback : v;
      const pctError = firstPercentDiscountError(
        validatePercentDiscount(
          {
            discountPercent: pick(body.discountPercent, cfg.percent),
            minimumSpend: pick(body.minimumSpend, cfg.minimumSpend),
            discountMax: pick(body.discountMax, cfg.maximumDiscount),
          },
          { requireAll: existing.status === "AWAITING_APPROVAL" },
        ),
      );
      if (pctError) return badRequest(pctError);
    }

    const merchantOfferUpdatable: Record<string, unknown> = {};
    if (body.title !== undefined) merchantOfferUpdatable.title = body.title;
    if (body.offerType !== undefined) merchantOfferUpdatable.offerType = body.offerType;
    // Offer category always mirrors the merchant's category (self-heals old offers on edit).
    merchantOfferUpdatable.categoryId = merchant.categoryId ?? null;
    if (body.startDate) merchantOfferUpdatable.startDate = new Date(body.startDate);
    if (body.endDate) merchantOfferUpdatable.endDate = new Date(body.endDate);
    // Evergreen offers are open-ended.
    else if (body.endDate === null && (body.isForever ?? existing.isForever)) merchantOfferUpdatable.endDate = null;
    if (body.isFlash !== undefined) merchantOfferUpdatable.isFlash = !!body.isFlash;

    const nextStartDate = body.startDate ?? existing.startDate;
    const nextEndDate = body.endDate === undefined ? existing.endDate : body.endDate;
    const effectiveForeverValue = Boolean(body.isForever ?? existing.isForever) || isEvergreenRange(nextStartDate, nextEndDate);
    if (body.isForever !== undefined || body.startDate !== undefined || body.endDate !== undefined) {
      merchantOfferUpdatable.isForever = effectiveForeverValue;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (Object.keys(merchantOfferUpdatable).length > 0) {
        await tx.merchantOffer.update({
          where: { id },
          data: merchantOfferUpdatable,
        });
      }

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
            ...(body.shortDescription !== undefined && { shortDescription: body.shortDescription }),
            ...(body.description !== undefined && { description: body.description }),
            ...(body.termsAndConditions !== undefined && { termsAndConditions: body.termsAndConditions }),
            ...(body.imageUrls !== undefined && { imageUrls: body.imageUrls }),
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
        const pricingConfig: Record<string, unknown> = {};
        if (body.offerType || body.discountValue !== undefined || body.discountMax !== undefined || body.discountPercent !== undefined || body.minimumSpend !== undefined) {
          const config = existing.pricing?.configuration as Record<string, unknown> ?? {};
          pricingConfig.amount = body.discountValue !== undefined ? (body.discountValue === null || body.discountValue === '' ? config.amount : Number(body.discountValue)) : config.amount;
          pricingConfig.percent = body.discountPercent !== undefined ? (body.discountPercent === null || body.discountPercent === '' ? config.percent : Number(body.discountPercent)) : config.percent;
          pricingConfig.maximumDiscount = body.discountMax !== undefined ? (body.discountMax === null || body.discountMax === '' ? config.maximumDiscount : Number(body.discountMax)) : config.maximumDiscount;
          pricingConfig.minimumSpend = body.minimumSpend !== undefined ? (body.minimumSpend === null || body.minimumSpend === '' ? config.minimumSpend : Number(body.minimumSpend)) : config.minimumSpend;
        }
        if (body.buyQuantity !== undefined || body.buyItem !== undefined || body.getQuantity !== undefined || body.freeItem !== undefined || body.maxFreeItems !== undefined) {
          const config = existing.pricing?.configuration as Record<string, unknown> ?? {};
          pricingConfig.buyQuantity = body.buyQuantity !== undefined ? (body.buyQuantity === null || body.buyQuantity === '' ? config.buyQuantity : Number(body.buyQuantity)) : config.buyQuantity;
          pricingConfig.buyItem = body.buyItem !== undefined ? (body.buyItem === null || body.buyItem === '' ? config.buyItem : body.buyItem) : config.buyItem;
          pricingConfig.getQuantity = body.getQuantity !== undefined ? (body.getQuantity === null || body.getQuantity === '' ? config.getQuantity : Number(body.getQuantity)) : config.getQuantity;
          pricingConfig.freeItem = body.freeItem !== undefined ? (body.freeItem === null || body.freeItem === '' ? config.freeItem : body.freeItem) : config.freeItem;
          pricingConfig.maxFreeItems = body.maxFreeItems !== undefined ? (body.maxFreeItems === null || body.maxFreeItems === '' ? config.maxFreeItems : Number(body.maxFreeItems)) : config.maxFreeItems;
        }

        await tx.offerPricing.upsert({
          where: { offerId: id },
          create: {
            offerId: id,
            pricingType: body.offerType ?? existing.offerType,
            configuration: pricingConfig as any,
          },
          update: {
            ...(body.offerType !== undefined && { pricingType: body.offerType }),
            configuration: pricingConfig as any,
          },
        });
      }

      if (
        body.redemptionType !== undefined ||
        body.redemptionCode !== undefined ||
        body.redemptionInstructions !== undefined ||
        body.bookingUrl !== undefined ||
        body.maxRedemptions !== undefined ||
        body.daysOfWeek !== undefined ||
        repeatAfterHours.value !== undefined ||
        branchSelection.value !== undefined
      ) {
        const config = (existing.redemption?.configuration as Record<string, unknown>) ?? {};
        let redemptionConfig: Record<string, unknown> = {
          ...config,
        };
        if (branchSelection.value) {
          redemptionConfig = withBranchSelection(redemptionConfig, branchSelection.value);
        }
        if (repeatAfterHours.value !== undefined) {
          redemptionConfig = withRepeatAfterHours(redemptionConfig, repeatAfterHours.value);
        }
        if (typeof body.redemptionCode === 'string' && body.redemptionCode.trim()) {
            redemptionConfig.code = body.redemptionCode.trim();
          }
        if (body.redemptionInstructions !== undefined) redemptionConfig.instructions = body.redemptionInstructions;
        if (body.bookingUrl !== undefined) redemptionConfig.bookingUrl = body.bookingUrl;

        const effectiveType = body.redemptionType ?? existing.redemption?.redemptionType;
        if (
          (effectiveType === 'ONLINE_CODE' || effectiveType === 'VIRTUAL_CARD_AUTO_VERIFY') &&
          !redemptionConfig.code
        ) {
          const newCode = await generateUniqueOfferCode();
          redemptionConfig.code = newCode;
          await createAuditLog({
            actorType: 'merchant',
            merchantId: merchant.id,
            action: "OFFER_CODE_GENERATED",
            entityType: "MERCHANT_OFFER",
            entityId: id,
            actorId: merchant?.accountId ?? null,
            metadata: { offerCode: newCode, redemptionType: effectiveType },
  });
}

        if (body.regenerateOfferCode) {
          const currentCode = typeof body.redemptionCode === 'string'
            ? body.redemptionCode.trim()
            : String(redemptionConfig.code ?? '').trim();
          const targetLength = clampOfferCodeLength(currentCode.length || 16);
          const newCode = await generateUniqueOfferCode(targetLength);
          redemptionConfig.code = newCode;
          await createAuditLog({
            actorType: 'merchant',
            merchantId: merchant.id,
            action: "OFFER_CODE_REGENERATED",
            entityType: "MERCHANT_OFFER",
            entityId: id,
            actorId: merchant?.accountId ?? null,
            metadata: { offerCode: newCode },
          });
        }

        redemptionConfig = withChannelDetails(redemptionConfig);
        const redemptionTypes = branchSelection.value
          ? channelRedemptionTypes(branchSelection.value.channel)
          : undefined;

        await tx.offerRedemption.upsert({
          where: { offerId: id },
          create: {
            offerId: id,
            redemptionType: body.redemptionType ?? null,
            redemptionTypes: redemptionTypes ?? (body.redemptionType ? [body.redemptionType] : []),
            configuration: Object.keys(redemptionConfig).length > 0 ? (redemptionConfig as any) : null,
            maxRedemptions: body.maxRedemptions ?? null,
            currentRedemptions: 0,
            daysOfWeek: body.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
          },
          update: {
            ...(body.redemptionType !== undefined && { redemptionType: body.redemptionType }),
            ...(redemptionTypes && { redemptionTypes }),
            ...(Object.keys(redemptionConfig).length > 0 && { configuration: (redemptionConfig as any) }),
            // Clearing the last key must still be written.
            ...(repeatAfterHours.value !== undefined && Object.keys(redemptionConfig).length === 0 && {
              configuration: Prisma.DbNull,
            }),
            ...(body.maxRedemptions !== undefined && { maxRedemptions: body.maxRedemptions === null || body.maxRedemptions === '' ? null : Number(body.maxRedemptions) }),
            ...(body.daysOfWeek !== undefined && {
              daysOfWeek: Array.isArray(body.daysOfWeek) ? body.daysOfWeek : [0, 1, 2, 3, 4, 5, 6],
            }),
          },
        });
      }

      if (body.submissionNotes !== undefined || body.replacementReason !== undefined) {
        await tx.offerReview.upsert({
          where: { offerId: id },
          create: {
            offerId: id,
            submissionNotes: body.submissionNotes ?? null,
            replacementReason: body.replacementReason ?? null,
            isReplacement: !!body.replacesOfferId,
          },
          update: {
            ...(body.submissionNotes !== undefined && { submissionNotes: body.submissionNotes }),
            ...(body.replacementReason !== undefined && { replacementReason: body.replacementReason }),
          },
        });
      }

      return tx.merchantOffer.findUnique({
        where: { id },
        include: {
          _count: { select: { redemptions: true } },
          content: true,
          pricing: true,
          redemption: true,
          review: true,
          analytics: true,
        },
      });
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return internalError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const merchant = await getMerchantFromSession();
    if (!merchant) return unauthorized();
    const { id } = await params;
    const existing = await getOwnOffer(merchant.id, id);
    if (!existing) return notFound();

    if (!DELETABLE_STATUSES.includes(existing.status)) {
      return forbidden(
        "Only drafts that were never submitted can be deleted",
      );
    }

    // Soft delete — set deletedAt, keep all data and storage assets intact
    await prisma.merchantOffer.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: merchant.id,
        deletedByRole: 'merchant',
      },
    });

    await createAuditLog({
      actorType: 'merchant',
      actorId: merchant.id,
      action: "OFFER_DELETED",
      entityType: "MERCHANT_OFFER",
      entityId: id,
      metadata: { title: existing.title, previousStatus: existing.status },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return internalError(error);
  }
}
