import { NextRequest, NextResponse } from "next/server";
import { recordOfferView } from "@/lib/offers/record-offer-view";
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

    // Legacy web route: employees are mobile-only now. Kept so the old
    // web RedeemModal doesn't break; shares the mobile logic.
    const result = await recordOfferView(offerId, employee.id);
    if (!result.recorded) return notFound(result.reason);
    return NextResponse.json({ success: true });
  } catch (error) {
    return internalError(error);
  }
}
