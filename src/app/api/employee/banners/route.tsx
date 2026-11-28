import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getEmployeeFromSession,
  unauthorized,
  internalError,
} from "@/lib/employee-session";
import { safeQuery } from "@/lib/prisma/safe-query";

export async function GET(_request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return unauthorized();
    if ("inactive" in employee) return unauthorized();

    const now = new Date();

    const rows = await safeQuery(
      () =>
        prisma.bannerBooking.findMany({
          where: {
            status: 'APPROVED',
            paid: true,
            startDate: { lte: new Date() },
            endDate: { gte: new Date() },
            // Admin deactivating a position takes its banners down immediately.
            banner: { isActive: true },
            // Merchant's primary category inactive → its banners are hidden.
            merchant: { category: { is: { isActive: true } } },
          },
          include: {
            content: true,
            banner: { select: { name: true, position: true } },
            merchant: { select: { businessName: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      [],
      { context: 'BannerBooking.findMany:employee-home' },
    );
    console.log('[BANNER BOOKINGS] Retrieved rows:', rows.length, rows);
    // Transform to match the expected response shape
    const formattedRows = rows.map((row) => ({
      id: row.id,
      image_url: row.content?.imageUrl,
      alt_text: row.content?.altText,
      redirect_url: row.content?.redirectUrl,
      business_name: row.merchant?.businessName,
      banner_name: row.banner?.name,
      position: row.banner?.position,
    }));

    return NextResponse.json({ success: true, data: formattedRows });
  } catch (error) {
    return internalError(error);
  }
}