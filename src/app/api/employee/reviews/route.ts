import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getEmployeeFromSession,
  unauthorized,
  companyInactive,
  badRequest,
  internalError,
} from "@/lib/employee-session";

/**
 * POST /api/employee/reviews
 *
 * Create or update a 1-5 star review for a merchant. One review per
 * (employeeId, merchantId) — upsert semantics.
 *
 * Body: { merchantId, offerId?, redemptionId?, rating }
 */
export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return unauthorized();
    if ("inactive" in employee) return companyInactive(employee.companyStatus);

    const body = await request.json().catch(() => ({}));
    const { merchantId, offerId, redemptionId, rating } = body;

    if (!merchantId || typeof merchantId !== "string") {
      return badRequest("merchantId is required");
    }
    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return badRequest("rating must be a number between 1 and 5");
    }

    const intRating = Math.round(rating);

    // Verify the merchant exists
    const merchant = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM merchants WHERE id = $1 AND deleted_at IS NULL`,
      merchantId,
    );
    if (merchant.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Merchant not found" } },
        { status: 404 },
      );
    }

    // Upsert: INSERT … ON CONFLICT (employee_id, merchant_id) DO UPDATE
    await prisma.$executeRawUnsafe(
      `INSERT INTO merchant_reviews (id, employee_id, merchant_id, company_id, offer_id, redemption_id, rating, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (employee_id, merchant_id)
       DO UPDATE SET rating = $6, offer_id = COALESCE($4, merchant_reviews.offer_id), redemption_id = COALESCE($5, merchant_reviews.redemption_id), updated_at = NOW()`,
      employee.id,
      merchantId,
      employee.companyId,
      offerId || null,
      redemptionId || null,
      intRating,
    );

    // Recalculate the merchant's denormalized averageRating from all reviews.
    // This is the only review write path, so this is the single point that
    // keeps merchants."averageRating" in sync.
    const agg = await prisma.merchantReview.aggregate({
      where: { merchantId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await prisma.merchant.update({
      where: { id: merchantId },
      data: { averageRating: agg._avg.rating ?? 0 },
    });

    const rows = await prisma.$queryRawUnsafe<
      { id: string; rating: number; created_at: string; updated_at: string }[]
    >(
      `SELECT id, rating, created_at, updated_at FROM merchant_reviews WHERE employee_id = $1 AND merchant_id = $2`,
      employee.id,
      merchantId,
    );

    return NextResponse.json(
      {
        success: true,
        data: rows[0],
        merchantAverageRating: agg._avg.rating ?? 0,
        merchantReviewCount: agg._count._all,
      },
      { status: 200 },
    );
  } catch (error) {
    return internalError(error);
  }
}

/**
 * GET /api/employee/reviews?merchantId=xxx
 *
 * Fetch the employee's review for a specific merchant.
 */
export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return unauthorized();
    if ("inactive" in employee) return companyInactive(employee.companyStatus);

    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get("merchantId");

    if (!merchantId) {
      return badRequest("merchantId query parameter is required");
    }

    const rows = await prisma.$queryRawUnsafe<
      { id: string; rating: number; created_at: string; updated_at: string }[]
    >(
      `SELECT id, rating, created_at, updated_at FROM merchant_reviews WHERE employee_id = $1 AND merchant_id = $2`,
      employee.id,
      merchantId,
    );

    return NextResponse.json({
      success: true,
      data: rows[0] ?? null,
    });
  } catch (error) {
    return internalError(error);
  }
}
