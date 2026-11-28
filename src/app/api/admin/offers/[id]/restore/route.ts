import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/supabase/server";
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

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "VALIDATION", message } },
    { status: 400 },
  );
}

function internalError(error: unknown) {
  console.error("Admin restore offer error:", error);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL", message: "Internal server error" } },
    { status: 500 },
  );
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "admin") return unauthorized();
    if (!user.profileId) return badRequest("Admin profile not found");

    const { id } = await params;

    const offer = await prisma.merchantOffer.findFirst({
      where: { id, deletedAt: { not: null } },
      include: { merchant: { select: { businessName: true } } },
    });

    if (!offer) return notFound("Deleted offer not found");

    if (offer.status === "LIVE") {
      return badRequest("Cannot restore a LIVE offer — LIVE offers are not eligible for soft delete");
    }

    await prisma.$transaction(async (tx) => {
      await tx.merchantOffer.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedById: null,
          deletedByRole: null,
        },
      });

      await createAuditLog({
        actorType: 'admin',
        actorId: user.profileId,
        action: "OFFER_RESTORED",
        entityType: "MERCHANT_OFFER",
        entityId: id,
        metadata: {
          title: offer.title,
          merchantBusinessName: offer.merchant.businessName,
          previousStatus: offer.status,
        },
      }, tx);
    });

    return NextResponse.json({ success: true, message: "Offer restored successfully" });
  } catch (error) {
    return internalError(error);
  }
}
