import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/supabase/server";
import { getMerchantFromSession } from '@/lib/merchant-session'
import { createAuditLog } from '@/services/audit-log.service';
import { channels, collectEmailWarnings, publishBusinessNotification, publishBusinessToAdmins } from '@/services/business-notification.service';

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

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "VALIDATION", message } },
    { status: 400 },
  );
}

function internalError(error: unknown) {
  console.error("Merchant offer revoke error:", error);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL", message: "Internal server error" } },
    { status: 500 },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  try {
    const merchant = await getMerchantFromSession();
    if (!merchant) return unauthorized();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { reason } = body;

    if (!reason?.trim()) {
      return badRequest("Revocation reason is required");
    }

    const offer = await prisma.merchantOffer.findFirst({
      where: { id, merchantId: merchant.id, deletedAt: null },
    });

    if (!offer) return notFound();

    if (offer.status !== "LIVE") {
      return badRequest("Only live offers can be revoked");
    }
    console.log(`Revoking offer ${id} for merchant ${merchant.id} by user ${user?.id ?? 'unknown'}`);
    await prisma.$transaction(async (tx) => {
      await tx.merchantOffer.update({
        where: { id },
        data: {
          status: "ARCHIVED",
          reviewedAt: new Date(),
        },
      });

      await tx.offerReview.upsert({
        where: { offerId: id },
        create: {
          offerId: id,
          reviewNotes: reason.trim(),
        },
        update: {
          reviewNotes: reason.trim(),
        },
      });
    });

    try {
      console.log( {actorType: 'merchant',
        merchantId: merchant.id,
        action: "OFFER_REVOKED",
        entityType: "MERCHANT_OFFER",
        entityId: id,
        actorId: user?.id ?? null,
        metadata: { title: offer.title, reason: reason.trim(), previousStatus: offer.status }})
      await createAuditLog({
        actorType: 'merchant',
        merchantId: merchant.id,
        action: "OFFER_REVOKED",
        entityType: "MERCHANT_OFFER",
        entityId: id,
        actorId: user?.id ?? null,
        metadata: { title: offer.title, reason: reason.trim(), previousStatus: offer.status },
      });
    } catch (auditError) {
      console.error('Audit log failed (non-fatal):', auditError);
    }

    const merchantOutcome = await publishBusinessNotification({
      type: 'OFFER_EXPIRED',
      title: `Offer revoked: ${offer.title}`,
      message: 'Your offer has been revoked and is no longer visible to employees.',
      priority: 'HIGH',
      recipients: [{ role: 'merchant', id: merchant.id }],
      channels: channels('IN_APP', 'PUSH', 'EMAIL'),
      referenceType: 'merchant_offer',
      referenceId: id,
      metadata: { reason: reason.trim(), previousStatus: offer.status },
      emailDetail: `Reason: ${reason.trim()}`,
      actionUrl: `/merchant/offers/${id}`,
      actionLabel: 'View offer',
    });
    await publishBusinessToAdmins({
      type: 'OFFER_EXPIRED',
      title: `Offer revoked by merchant: ${offer.title}`,
      message: `Reason: ${reason.trim()}`,
      priority: 'NORMAL',
      channels: channels('IN_APP'),
      referenceType: 'merchant_offer',
      referenceId: id,
      metadata: { merchantId: merchant.id, reason: reason.trim() },
    });

    return NextResponse.json({
      success: true,
      message: "Offer revoked successfully",
      emailWarnings: collectEmailWarnings(merchantOutcome),
    });
  } catch (error) {
    return internalError(error);
  }
}
