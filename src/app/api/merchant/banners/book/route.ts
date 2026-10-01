import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/supabase/server";
import { getMerchantFromSession } from "@/lib/merchant-session";
import { assignFreeSlot } from "@/lib/banner-slots";
import {
  deleteOfferImage,
  uploadOfferImage,
} from "@/lib/upload-offer-image";

function unauthorized() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      },
    },
    { status: 401 },
  );
}

function notFound() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Merchant not found",
      },
    },
    { status: 404 },
  );
}

function badRequest(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "VALIDATION",
        message,
      },
    },
    { status: 400 },
  );
}

function internalError(error: unknown) {
  console.error("Merchant book banner API error:", error);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: "INTERNAL",
        message: "Internal server error",
      },
    },
    { status: 500 },
  );
}

export async function POST(request: NextRequest) {
  let uploadedImageKey: string | null = null;

  try {
    const user = await getCurrentUser();

    if (!user || user.userType !== "merchant") {
      return unauthorized();
    }

    const merchant = await getMerchantFromSession();

    if (!merchant) {
      return notFound();
    }

    const formData = await request.formData();

    const bannerId = formData.get("bannerId")?.toString();
    const startDate = formData.get("startDate")?.toString();
    const endDate = formData.get("endDate")?.toString();

    const altText =
      formData.get("altText")?.toString() ?? "";

    const redirectType =
      formData.get("redirectType")?.toString() ?? "EXTERNAL";

    const redirectUrl =
      formData.get("redirectUrl")?.toString() || null;

    const offerId =
      formData.get("offerId")?.toString() || null;

    const image = formData.get("image");
    const urlType = formData.get("urlType")?.toString() || null;
    // Existing image URL can be used when no new image is supplied.
    const existingImageUrl =
      formData.get("imageUrl")?.toString() || null;

    /*
     * --------------------------------------------------
     * Basic validation
     * --------------------------------------------------
     */

    if (!bannerId || !startDate || !endDate) {
      return badRequest(
        "bannerId, startDate, and endDate are required",
      );
    }

    if (
      redirectType !== "EXTERNAL" &&
      redirectType !== "OFFER"
    ) {
      return badRequest("Invalid redirect type");
    }

    /*
     * --------------------------------------------------
     * Redirect validation
     * --------------------------------------------------
     */

    if (
      redirectType === "EXTERNAL" &&
      !redirectUrl
    ) {
      return badRequest(
        "redirectUrl is required for external links",
      );
    }

    if (
      redirectType === "OFFER" &&
      !offerId
    ) {
      return badRequest(
        "offerId is required for merchant offers",
      );
    }

    /*
     * --------------------------------------------------
     * Validate selected merchant offer
     * --------------------------------------------------
     */

    if (
      redirectType === "OFFER" &&
      offerId
    ) {
      const offer = await prisma.merchantOffer.findFirst({
        where: {
          id: offerId,
          merchantId: merchant.id,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!offer) {
        return badRequest(
          "Selected offer does not belong to this merchant",
        );
      }
    }

    /*
     * --------------------------------------------------
     * Image validation
     * --------------------------------------------------
     */

    if (
      image &&
      !(image instanceof File)
    ) {
      return badRequest("Invalid banner image");
    }

    if (!image && !existingImageUrl) {
      return badRequest("Banner image is required");
    }

    /*
     * --------------------------------------------------
     * Banner validation
     * --------------------------------------------------
     */

    const banner = await prisma.banner.findUnique({
      where: {
        id: bannerId,
      },
    });

    if (!banner) {
      return badRequest("Banner slot not found");
    }

    if (!banner.isActive) {
      return badRequest("Banner slot is not active");
    }

    /*
     * --------------------------------------------------
     * Date validation
     * --------------------------------------------------
     */

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (
      isNaN(start.getTime()) ||
      isNaN(end.getTime())
    ) {
      return badRequest("Invalid date format");
    }

    if (start >= end) {
      return badRequest(
        "End date must be after start date",
      );
    }

    const days = Math.ceil(
      (end.getTime() - start.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (days < banner.minDays) {
      return badRequest(
        `Minimum booking period is ${banner.minDays} days`,
      );
    }

    if (days > banner.maxDays) {
      return badRequest(
        `Maximum booking period is ${banner.maxDays} days`,
      );
    }

    if (
      banner.expiresAt &&
      end > banner.expiresAt
    ) {
      return badRequest(
        `Booking cannot extend beyond banner expiry (${banner.expiresAt.toLocaleDateString()})`,
      );
    }

    const totalPrice =
      Number(banner.pricePerDay) * days;

    /*
     * --------------------------------------------------
     * Upload image AFTER validation
     * --------------------------------------------------
     */

    let imageUrl = existingImageUrl ?? "";

    if (image instanceof File) {
      const uploadedImageUrl =
        await uploadOfferImage(image);

      imageUrl = uploadedImageUrl ?? "";

      if (!imageUrl) {
        return badRequest(
          "Failed to upload banner image",
        );
      }

      uploadedImageKey = uploadedImageUrl;
    }

    /*
     * --------------------------------------------------
     * Create booking + content
     * --------------------------------------------------
     */

    const result = await prisma.$transaction(
      async (tx) => {
        const assignedSlot = await assignFreeSlot(
          tx,
          bannerId,
          banner.slotCount,
          start,
          end,
        );

        if (assignedSlot === null) {
          throw new Error(
            `All ${banner.slotCount} slots for ${banner.position} are booked for the requested dates. Please choose different dates or check back later.`,
          );
        }

        const booking =
          await tx.bannerBooking.create({
            data: {
              bannerId,
              merchantId: merchant.id,
              slotNumber: assignedSlot,
              startDate: start,
              endDate: end,
              totalPrice,
              status: "PENDING",
            },
          });

        // BannerContent has no offerId column — the selected offerId is
        // validated above against the merchant, and OFFER bookings point the
        // banner at the employee offers catalogue.
        await tx.bannerContent.create({
          data: {
            bookingId: booking.id,
            imageUrl,
            altText,
            urlType: urlType,
            redirectUrl:
              redirectType === "EXTERNAL"
                ? redirectUrl
                : offerId,
          },
        });

        return tx.bannerBooking.findUnique({
          where: {
            id: booking.id,
          },
          include: {
            banner: {
              select: {
                id: true,
                name: true,
                position: true,
              },
            },
            content: true,
          },
        });
      },
    );

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    /*
     * If the image was uploaded but booking creation failed,
     * remove the S3 object.
     */
    if (uploadedImageKey) {
      try {
        await deleteOfferImage(
          uploadedImageKey,
        );
      } catch (cleanupError) {
        console.error(
          "Failed to clean up banner image after booking failure:",
          cleanupError,
        );
      }
    }

    if (
      error instanceof Error &&
      error.message.includes("slots for")
    ) {
      return badRequest(error.message);
    }

    return internalError(error);
  }
}