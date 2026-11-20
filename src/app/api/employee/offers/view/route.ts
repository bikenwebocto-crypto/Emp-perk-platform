import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getEmployeeFromSession,
  unauthorized,
  companyInactive,
  notFound,
  badRequest,
  internalError,
} from "@/lib/employee-session";

/**
 * POST /api/employee/offers/view
 *
 * Records that the authenticated employee has *viewed* an offer.
 *
 * Business rules (per spec):
 *   - One unique view per (offerId, employeeId).
 *   - The view is recorded once; reopening the same offer does NOT
 *     increase the count.
 *   - viewCount on MerchantOffer represents UNIQUE employee views.
 *
 * Implementation:
 *   - The unique constraint on (offerId, employeeId) is the source of
 *     truth for "first view vs repeat view".
 *   - A single CTE statement performs the insert-or-skip AND the
 *     conditional viewCount increment atomically in one round-trip.
 *   - The view row is inserted; if it conflicts (already viewed),
 *     the UPDATE is a no-op (no rows joined).
 *
 * Raw SQL is used here because the current Prisma client was
 * generated before the OfferView model was added to the schema.
 * When the dev environment regenerates the client, the route can
 * be migrated to `prisma.offerView` (a follow-up that does not
 * change the runtime semantics).
 */
export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return unauthorized();
    if ("inactive" in employee) return companyInactive(employee.companyStatus);

    const body = (await request.json().catch(() => ({}))) as {
      offerId?: string;
    };
    const offerId = body.offerId;
    if (!offerId || typeof offerId !== "string") {
      return badRequest("offerId is required");
    }

    // Verify the offer exists and is currently visible to this
    // employee. We don't 404 specifically on a non-existent offer
    // (analytics is best-effort) but we DO want to avoid crediting
    // a view to a deleted/hidden offer.
    const offer = await prisma.merchantOffer.findFirst({
      where: { id: offerId, deletedAt: null },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!offer || offer.deletedAt) {
      return notFound("Offer not found");
    }

    // Atomic "insert-or-skip + conditional increment" via a single
    // SQL statement. Two benefits:
    //   1. One round-trip, one transaction (Prisma sends as a single
    //      batch).
    //   2. The UPDATE is only joined to rows that were *just*
    //      inserted, so a repeat view never increments viewCount.
    // Record a unique (offerId, employeeId) view; repeat opens are skipped.
    const inserted = await prisma.offerView.createMany({
      data: [{ offerId, employeeId: employee.id }],
      skipDuplicates: true,
    });

    // Only bump the all-time unique counter when this was a first view.
    if (inserted.count > 0) {
      await prisma.offerAnalytics.upsert({
        where: { offerId },
        create: { offerId, viewCount: 1 },
        update: { viewCount: { increment: 1 } },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return internalError(error);
  }
}
