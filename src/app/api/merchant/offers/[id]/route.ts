import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMerchantFromSession } from '@/lib/merchant-session'
import { generateUniqueOfferCode } from '@/lib/offer-code';
import { ensureOfferQRCode } from '@/lib/offer-qr';

import { createAuditLog } from '@/services/audit-log.service';

const EDITABLE_STATUSES = ["DRAFT", "VALIDATION_FAILED", "AWAITING_APPROVAL"];
const VALID_REDEMPTION_TYPES = ['ONLINE_CODE', 'BOOKING_LINK', 'IN_STORE_QR', 'VIRTUAL_CARD_AUTO_VERIFY'] as const;
const DELETABLE_STATUSES = [
  "DRAFT",
  "VALIDATION_FAILED",
  "REJECTED",
  "EXPIRED",
  "REPLACED",
  "AWAITING_APPROVAL",
  "ARCHIVED",
];

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

    return NextResponse.json({ success: true, data: offer });
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

    const merchantOfferUpdatable: Record<string, unknown> = {};
    if (body.title !== undefined) merchantOfferUpdatable.title = body.title;
    if (body.offerType !== undefined) merchantOfferUpdatable.offerType = body.offerType;
    // Offer category always mirrors the merchant's category (self-heals old offers on edit).
    merchantOfferUpdatable.categoryId = merchant.categoryId ?? null;
    if (body.startDate) merchantOfferUpdatable.startDate = new Date(body.startDate);
    if (body.endDate) merchantOfferUpdatable.endDate = new Date(body.endDate);

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
        body.daysOfWeek !== undefined
      ) {
        const config = (existing.redemption?.configuration as Record<string, unknown>) ?? {};
        const redemptionConfig: Record<string, unknown> = {
          ...config,
        };
        if (body.redemptionCode !== undefined) redemptionConfig.code = body.redemptionCode;
        if (body.redemptionInstructions !== undefined) redemptionConfig.instructions = body.redemptionInstructions;
        if (body.bookingUrl !== undefined) redemptionConfig.bookingUrl = body.bookingUrl;

        if (body.redemptionType === 'ONLINE_CODE' && existing.redemption?.redemptionType !== 'ONLINE_CODE' && !config.code) {
          const newCode = await generateUniqueOfferCode();
          redemptionConfig.code = newCode;
          await createAuditLog({
            actorType: 'merchant',
            merchantId: merchant.id,
            action: "OFFER_CODE_GENERATED",
            entityType: "MERCHANT_OFFER",
            entityId: id,
            actorId: merchant?.accountId ?? null,
            metadata: { offerCode: newCode, redemptionType: 'ONLINE_CODE' },
          });
        }

        if (body.regenerateOfferCode) {
          const newCode = await generateUniqueOfferCode();
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

        await tx.offerRedemption.upsert({
          where: { offerId: id },
          create: {
            offerId: id,
            redemptionType: body.redemptionType ?? null,
            configuration: Object.keys(redemptionConfig).length > 0 ? (redemptionConfig as any) : null,
            maxRedemptions: body.maxRedemptions ?? null,
            currentRedemptions: 0,
            daysOfWeek: body.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
          },
          update: {
            ...(body.redemptionType !== undefined && { redemptionType: body.redemptionType }),
            ...(Object.keys(redemptionConfig).length > 0 && { configuration: (redemptionConfig as any) }),
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
        "Only draft, validation-failed, rejected, expired, replaced, awaiting-approval, or archived offers can be deleted",
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
