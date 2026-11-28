import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAdminClient } from '@/lib/supabase/admin';
import { createAuditLog } from '@/services/audit-log.service';

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

function internalError(error: unknown) {
  console.error("Admin permanent delete offer error:", error);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL", message: "Internal server error" } },
    { status: 500 },
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "admin") return unauthorized();
    if (!user.profileId) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_ADMIN_PROFILE', message: 'Admin profile not found' } },
        { status: 403 },
      );
    }

    const { id } = await params;

    const offer = await prisma.merchantOffer.findFirst({
      where: { id, deletedAt: { not: null } },
      include: {
        merchant: { select: { businessName: true } },
        content: { select: { imageUrls: true } },
        redemption: { select: { configuration: true } },
      },
    });

    if (!offer) return notFound("Deleted offer not found");

    const redemptionConfig = (offer.redemption?.configuration as Record<string, unknown>) ?? {}
    const qrCodeUrl = redemptionConfig.qrCodeUrl as string | undefined
    const imageUrls = offer.content?.imageUrls ?? []

    // Hard delete (cascades to OfferContent, OfferPricing, OfferRedemption, OfferReview,
    // OfferAnalytics) and its audit evidence commit together.
    await prisma.$transaction(async (tx) => {
      await tx.merchantOffer.delete({ where: { id } });
      await createAuditLog({
        actorType: 'admin',
        actorId: user.profileId,
        action: "OFFER_PERMANENTLY_DELETED",
        entityType: "MERCHANT_OFFER",
        entityId: id,
        metadata: {
          title: offer.title,
          merchantBusinessName: offer.merchant.businessName,
          previousStatus: offer.status,
          hadQrCode: !!qrCodeUrl,
          imageCount: imageUrls.length,
        },
      }, tx);
    });

    // Clean up storage only after the delete committed.
    if (qrCodeUrl) {
      try {
        const admin = getAdminClient();
        const pathMatch = qrCodeUrl.match(/qr-code\/[^?]+/);
        if (pathMatch) {
          await admin.storage.from('offer-images').remove([pathMatch[0]]);
        }
      } catch {
        // Non-blocking
      }
    }

    for (const url of imageUrls) {
      try {
        const admin = getAdminClient();
        const pathMatch = url.match(/offer-images\/[^?]+/);
        if (pathMatch) {
          await admin.storage.from('offer-images').remove([pathMatch[0]]);
        }
      } catch {
        // Non-blocking
      }
    }

    return NextResponse.json({ success: true, message: "Offer permanently deleted" });
  } catch (error) {
    return internalError(error);
  }
}
