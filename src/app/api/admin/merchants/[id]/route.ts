import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/supabase/server";
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service';
import { deleteImage } from '@/lib/upload/image';
import { mergeSocialLinks, validateSocialLinks } from '@/lib/social-links';
import { selectableCategoryWhere } from '@/lib/categories';

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
    if (!user || user.userType !== "admin") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        },
        { status: 401 },
      );
    }
    if (!user.profileId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NO_ADMIN_PROFILE", message: "Admin profile not found" },
        },
        { status: 403 },
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
      "socialLinks",
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

    if (data.categoryId !== undefined && data.categoryId !== null) {
      if (typeof data.categoryId !== 'string') {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_CATEGORY", message: "Selected category does not exist." } },
          { status: 400 },
        );
      }
      const category = await prisma.category.findFirst({
        where: { id: data.categoryId, ...selectableCategoryWhere },
        select: { id: true },
      });
      if (!category) {
        return NextResponse.json(
          { success: false, error: { code: "INVALID_CATEGORY", message: "Select an active platform category." } },
          { status: 400 },
        );
      }
    }

    // Merge social links over what's stored so editing one platform never
    // wipes the others, and drop empty values.
    if (data.socialLinks !== undefined) {
      const socialError = validateSocialLinks(data.socialLinks);
      if (socialError) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION", message: socialError } },
          { status: 400 },
        );
      }
      data.socialLinks = (mergeSocialLinks(merchant.socialLinks, data.socialLinks) ?? null) as any;
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
            createdBy: user.profileId,
          },
        });

        // Step 3: link the new account's id onto the merchant update payload.
        data.accountId = account.authUserId;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.merchant.update({
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

      const nextAccountStatus =
        result.status === 'ACTIVE'
          ? 'ACTIVE'
          : result.status === 'PAUSED'
            ? 'INACTIVE'
            : result.status === 'SUSPENDED' || result.status === 'ARCHIVED' || result.status === 'REJECTED'
              ? 'SUSPENDED'
              : result.status === 'PENDING'
                ? 'PENDING'
                : undefined;

      if (merchant.accountId && nextAccountStatus) {
        await tx.account.update({
          where: { authUserId: merchant.accountId },
          data: { status: nextAccountStatus },
        });
      }

      await createAuditLog(fromCurrentUser(user, 'MERCHANT_UPDATED', 'merchant', id, {
        changes: Object.keys(data),
      }), tx);

      return result;
    });

    // Clean up replaced logo/cover files from storage
    if (data.logoUrl && data.logoUrl !== merchant.logoUrl && merchant.logoUrl) {
      deleteImage(merchant.logoUrl, { bucket: 'offer-images' }).catch(() => {});
    }
    if (data.coverImageUrl && data.coverImageUrl !== merchant.coverImageUrl && merchant.coverImageUrl) {
      deleteImage(merchant.coverImageUrl, { bucket: 'offer-images' }).catch(() => {});
    }
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
    if (!user.profileId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NO_ADMIN_PROFILE", message: "Admin profile not found" },
        },
        { status: 403 },
      );
    }

    const { id } = await params;

    const body = await _request.json().catch(() => null);
    const reason =
      typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
    if (!reason) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION", message: "reason is required to delete a merchant" },
        },
        { status: 400 },
      );
    }

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

    await prisma.$transaction(async (tx) => {
      await tx.merchant.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: user.profileId },
      });

      await createAuditLog(fromCurrentUser(user, 'MERCHANT_DELETED', 'merchant', id, {
        changes: {
          businessName: merchant.businessName,
          status: merchant.status,
          reason,
        },
      }), tx);
    });

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
