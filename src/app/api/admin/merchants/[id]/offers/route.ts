import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const merchant = await prisma.merchant.findUnique({
      where: { id },
    });

    if (!merchant || merchant.deletedAt) {
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

    const offers = await prisma.merchantOffer.findMany({
      where: {
        merchantId: id,
        deletedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        title: true,
        status: true,
        offerType: true,
        startDate: true,
        endDate: true,

        content: {
          select: {
            description: true,
            shortDescription: true,
            termsAndConditions: true,
            imageUrls: true,
          },
        },

        pricing: {
          select: {
            configuration: true,
          },
        },

        capacity: {
          select: {
            redeemedCount: true,
            maxRedemptions: true,
          },
        },

        _count: {
          select: {
            redemptions: true,
          },
        },

        replacesOffer: {
          select: {
            id: true,
            title: true,
          },
        },

        review: {
          select: {
            reviewNotes: true,
            rejectionReason: true,
          },
        },
      },
    });

    const data = offers.map((offer) => {
      const configuration =
        (offer.pricing?.configuration as Record<string, unknown> | null) ?? {};

      return {
        // Existing merchant table fields
        id: offer.id,
        title: offer.title,
        status: offer.status,
        offerType: offer.offerType,
        startDate: offer.startDate,
        endDate: offer.endDate,

        // Fields required by EditOfferModal / OfferForm
        description: offer.content?.description ?? "",
        shortDescription: offer.content?.shortDescription ?? "",
        termsAndConditions: offer.content?.termsAndConditions ?? "",
        imageUrls: offer.content?.imageUrls ?? [],

        discountValue: configuration.discountValue ?? "",
        discountMax: configuration.discountMax ?? "",
        discountPercent: configuration.discountPercent ?? "",
        minimumSpend: configuration.minimumSpend ?? "",

        maxRedemptions: offer.capacity?.maxRedemptions ?? "",

        buyQuantity: configuration.buyQuantity ?? "",
        buyItem: configuration.buyItem ?? "",
        getQuantity: configuration.getQuantity ?? "",
        freeItem: configuration.freeItem ?? "",
        maxFreeItems: configuration.maxFreeItems ?? "",

        daysOfWeek: configuration.daysOfWeek ?? "",
        redemptionCode: configuration.redemptionCode ?? "",
        redemptionInstructions: configuration.redemptionInstructions ?? "",

        categoryId: configuration.categoryId ?? "",
        submissionNotes: configuration.submissionNotes ?? "",

        redemptionType: configuration.redemptionType ?? "IN_STORE_QR",

        bookingUrl: configuration.bookingUrl ?? "",
        qrCodeUrl: configuration.qrCodeUrl ?? "",

        // Existing additional data
        _count: offer._count,
        replacesOffer: offer.replacesOffer,
        review: offer.review,
      };
    });

    return NextResponse.json({
      success: true,
      data,
      meta: {
        total: data.length,
      },
    });
  } catch (error) {
    console.error("Merchant offers error:", error);

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
}
