import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/supabase/server";
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service';
import { deleteImage } from '@/lib/upload/image';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const merchant = await prisma.merchant.findUnique({
      where: { id },
      include: {
        account: {
          select: {
            email: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: { select: { offers: true, branches: true, redemptions: true } },
      },
    });

    if (!merchant || merchant.deletedAt) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Merchant not found" },
        },
        { status: 404 },
      );
    }

    // averageRating intentionally removed from this response (deferred decision).
    // Business metrics live in the dedicated /business-overview endpoint.
    const { averageRating: _removedRating, ...merchantData } = merchant;

    return NextResponse.json({ success: true, data: merchantData });
  } catch (error) {
    console.error("Merchant detail error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL", message: "Internal server error" },
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    console.log("** Authenticated user:", user);
    if (!user || user.userType !== "admin") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        },
        { status: 401 },
      );
    }

    const { id } = await params;
    const body = await request.json();

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant || merchant.deletedAt) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Merchant not found" },
        },
        { status: 404 },
      );
    }

    const updatableFields = [
      "businessName",
      "contactName",
      "contactPhone",
      "description",
      "website",
      "categoryId",
      "logoUrl",
      "coverImageUrl",
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "postalCode",
      "country",
      "status",
      "adminNote",
    ];

    const data: Record<string, unknown> = {};
    for (const field of updatableFields) {
      if (body[field] !== undefined) data[field] = body[field];
    }

    if (data.status && data.status !== merchant.status) {
      await prisma.merchantStatusHistory.create({
        data: {
          merchantId: id,
          fromStatus: merchant.status,
          toStatus: data.status as any,
          changedBy: user.id,
          changedByType: "admin",
        },
      });
    }

    if (data.status === "ACTIVE") {
      data.approvedAt = merchant.approvedAt ?? new Date();
      data.liveAt = merchant.liveAt ?? new Date();
    }

    // Handle email change via Account
    // Step 1: check if an Account with this email already exists.
    // Step 2: if not, insert directly into the Account table (Prisma
    //         generates authUserId itself via @default(uuid())).
    // Step 3: set data.accountId so the merchant.update() below writes the link.
    const bodyEmail = body.email as string | undefined;
    if (bodyEmail !== undefined) {
      const newEmail = bodyEmail.trim().toLowerCase();

      if (newEmail && merchant.accountId) {
        // Merchant already has an account — just update its email.
        await prisma.account.update({
          where: { authUserId: merchant.accountId },
          data: { email: newEmail },
        });
      } else if (newEmail && !merchant.accountId) {
        // Step 1: is this email already taken by another account?
        const existingAccount = await prisma.account.findUnique({ where: { email: newEmail } });
        if (existingAccount) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "EMAIL_IN_USE", message: "This email is already linked to another account." },
            },
            { status: 409 },
          );
        }

        // Step 2: not present — insert a new Account row directly.
        const account = await prisma.account.create({
          data: {
            email: newEmail,
            role: "MERCHANT",
            profileType: "MERCHANT",
            status: "ACTIVE",
            createdBy: user.id,
          },
        });

        // Step 3: link the new account's id onto the merchant update payload.
        data.accountId = account.authUserId;
      }
    }

    const updated = await prisma.merchant.update({
      where: { id },
      data: data as any,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            offers: true,
            branches: true,
            redemptions: true,
            issues: true,
          },
        },
      },
    });

    // Clean up replaced logo/cover files from storage
    if (data.logoUrl && data.logoUrl !== merchant.logoUrl && merchant.logoUrl) {
      deleteImage(merchant.logoUrl, { bucket: 'offer-images' }).catch(() => {});
    }
    if (data.coverImageUrl && data.coverImageUrl !== merchant.coverImageUrl && merchant.coverImageUrl) {
      deleteImage(merchant.coverImageUrl, { bucket: 'offer-images' }).catch(() => {});
    }

    await createAuditLog(fromCurrentUser(user, 'MERCHANT_UPDATED', 'merchant', id, {
      changes: Object.keys(data),
    }));
    return NextResponse.json({
      success: true,
      data: updated,
      message: "Merchant updated successfully",
    });
  } catch (error) {
    console.error("Merchant update error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL", message: "Internal server error" },
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "admin") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        },
        { status: 401 },
      );
    }

    const { id } = await params;

    const merchant = await prisma.merchant.findUnique({ where: { id } });
    if (!merchant || merchant.deletedAt) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Merchant not found" },
        },
        { status: 404 },
      );
    }

    await prisma.merchant.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: user.id },
    });

    await createAuditLog(fromCurrentUser(user, 'MERCHANT_DELETED', 'merchant', id, {
      changes: {
        businessName: merchant.businessName,
      },
    }));

    return NextResponse.json({
      success: true,
      data: null,
      message: "Merchant deleted successfully",
    });
  } catch (error) {
    console.error("Merchant delete error:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL", message: "Internal server error" },
      },
      { status: 500 },
    );
  }
}
