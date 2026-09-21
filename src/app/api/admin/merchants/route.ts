import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/supabase/server";
import { createAuditLog, fromCurrentUser } from "@/services/audit-log.service";
import { adminApproveMerchantSchema } from "@/schemas";
import { createPerfTimer } from "@/lib/perf";
import {
  BUSINESS_NOTIFICATION_TEMPLATES,
  channels,
  publishBusinessNotification,
} from "@/services/business-notification.service";

function unauthorized() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    },
    { status: 401 },
  );
}

function notFound(entity: string) {
  return NextResponse.json(
    {
      success: false,
      error: { code: "NOT_FOUND", message: `${entity} not found` },
    },
    { status: 404 },
  );
}

function internalError(error: unknown) {
  console.error("Merchants API error:", error);
  return NextResponse.json(
    {
      success: false,
      error: { code: "INTERNAL", message: "Internal server error" },
    },
    { status: 500 },
  );
}

// GET /api/admin/merchants — list merchants
export async function GET(request: NextRequest) {
  const timer = createPerfTimer("GET /api/admin/merchants");
  timer.section("Authentication");
  try {
    const user = await getCurrentUser(timer);
    timer.point("user auth check");
    // if (!user || user.userType !== 'admin') return unauthorized();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const categoryId = searchParams.get("categoryId");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20")),
    );
    const q = searchParams.get("q");

    const where: any = { deletedAt: null };
    if (status && status !== "ALL") where.status = status;
    if (categoryId && categoryId !== "ALL") where.categoryId = categoryId;

    timer.section("Search Query");
    if (q) {
      timer.point("account.findMany (email search)");
      const matchingAccounts = await prisma.account.findMany({
        where: {
          email: { contains: q, mode: "insensitive" },
          profileType: "MERCHANT",
        },
        select: { authUserId: true },
      });
      const accountAuthUserIds = matchingAccounts
        .map((a) => a.authUserId)
        .filter(Boolean);
      where.OR = [
        { businessName: { contains: q, mode: "insensitive" } },
        { contactName: { contains: q, mode: "insensitive" } },
      ];
      if (accountAuthUserIds.length > 0) {
        where.OR.push({ accountId: { in: accountAuthUserIds } });
      }
    }

    timer.section("Database Queries");
    timer.point("merchant.findMany + merchant.count");
    const [merchants, total] = await Promise.all([
      prisma.merchant.findMany({
        where: where as any,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          _count: {
            select: {
              offers: true,
              branches: true,
              redemptions: true,
              issues: true,
            },
          },
        },
      }),
      prisma.merchant.count({ where: where as any }),
    ]);

    timer.section("Serialization");
    timer.point("NextResponse.json");
    timer.end();
    return NextResponse.json({
      success: true,
      data: merchants,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    timer.end();
    return internalError(error);
  }
}

// POST /api/admin/merchants — approve/reject merchant
export async function POST(request: NextRequest) {
  const timer = createPerfTimer("POST /api/admin/merchants");
  timer.section("Authentication");
  try {
    const user = await getCurrentUser(timer);
    timer.point("user auth check");
    if (!user) return unauthorized();

    timer.section("Validation");
    timer.point("adminUser.findUnique");
    const adminRecord = await prisma.adminUser.findUnique({
      where: { id: user.id },
    });

    const body = await request.json();
    const parsed = adminApproveMerchantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION",
            message: "Validation failed",
            details: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const { merchantId, status, rejectionReason, notes, adminNote } =
      parsed.data;

    timer.section("Database Queries");
    timer.point("merchant.findUnique");
    const existing = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!existing || existing.deletedAt) return notFound("Merchant");
    const previousStatus = existing.status;

    timer.point("merchant.update");
    const merchant = await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        status: status as any,
        rejectionReason,
        adminNote: adminNote ?? existing.adminNote,
        notes: notes ?? existing.notes,
        approvedAt: status === "ACTIVE" ? new Date() : undefined,
        liveAt:
          status === "ACTIVE" && !existing.liveAt ? new Date() : undefined,
        onboardingStep:
          status === "ACTIVE" ? "COMPLETE" : existing.onboardingStep,
      },
    });

    // Sync the linked Account's status with the merchant's approval status
    if (existing.accountId) {
      timer.point("account.update (sync status)");
      await prisma.account.update({
        where: { authUserId: existing.accountId },
        data: {
          status:
            status === "ACTIVE"
              ? "ACTIVE"
              : status === "REJECTED"
                ? "SUSPENDED"
                : undefined,
        },
      });
    }

    timer.point("merchantStatusHistory.create");
    await prisma.merchantStatusHistory.create({
      data: {
        merchantId,
        fromStatus: previousStatus,
        toStatus: status as any,
        changedBy: user.id,
        changedByType: "admin",
        reason: rejectionReason,
      },
    });

    timer.point("createAuditLog");
    await createAuditLog(
      fromCurrentUser(user, `MERCHANT_${status}`, "merchant", merchantId, {
        changes: { from: previousStatus, to: status, rejectionReason },
      }),
    );

    timer.point("actionQueueItem.updateMany");
    await prisma.actionQueueItem.updateMany({
      where: {
        referenceId: merchantId,
        referenceType: "merchant",
        status: "PENDING",
      },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    const template =
      status === "ACTIVE"
        ? BUSINESS_NOTIFICATION_TEMPLATES.merchantApproved(
            merchant.businessName,
          )
        : status === "REJECTED"
          ? {
              type: "MERCHANT_REJECTED" as const,
              title: `Merchant rejected: ${merchant.businessName}`,
              message:
                "Your merchant registration was rejected. Review the provided reason for details.",
              priority: "HIGH" as const,
            }
          : null;
    if (template) {
      await publishBusinessNotification({
        ...template,
        recipients: [{ role: "merchant", id: merchant.id }],
        channels: channels("IN_APP", "PUSH", "EMAIL"),
        referenceType: "merchant",
        referenceId: merchant.id,
        metadata: {
          previousStatus,
          status,
          rejectionReason: rejectionReason ?? null,
        },
      });
    }

    timer.section("Serialization");
    timer.point("NextResponse.json");
    timer.end();
    return NextResponse.json({
      success: true,
      data: merchant,
      message: `Merchant ${status.toLowerCase()} successfully`,
    });
  } catch (error: any) {
    timer.end();
    return internalError(error);
  }
}
// PATCH /api/admin/merchants — update merchant details
export async function PATCH(request: NextRequest) {
  const timer = createPerfTimer("PATCH /api/admin/merchants");
  timer.section("Authentication");
  try {
    const user = await getCurrentUser(timer);
    timer.point("user auth check");
    if (!user || user.userType !== "admin") return unauthorized();

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION", message: "Merchant ID is required" },
        },
        { status: 400 },
      );
    }

    timer.section("Database Queries");
    timer.point("merchant.findUnique");
    const existing = await prisma.merchant.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return notFound("Merchant");

    timer.point("merchant.update");
    const merchant = await prisma.merchant.update({
      where: { id },
      data: updates,
    });

    timer.point("createAuditLog");
    await createAuditLog(
      fromCurrentUser(user, "MERCHANT_UPDATED", "merchant", id, {
        changes: updates,
      }),
    );

    timer.section("Serialization");
    timer.point("NextResponse.json");
    timer.end();
    return NextResponse.json({
      success: true,
      data: merchant,
      message: "Merchant updated successfully",
    });
  } catch (error) {
    timer.end();
    return internalError(error);
  }
}

// DELETE /api/admin/merchants — soft-delete a merchant
export async function DELETE(request: NextRequest) {
  const timer = createPerfTimer("DELETE /api/admin/merchants");
  timer.section("Authentication");
  try {
    const user = await getCurrentUser(timer);
    timer.point("user auth check");
    if (!user || user.userType !== "admin") return unauthorized();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION", message: "Merchant ID is required" },
        },
        { status: 400 },
      );
    }

    timer.section("Database Queries");
    timer.point("merchant.findUnique");
    const existing = await prisma.merchant.findUnique({ where: { id } });
    if (!existing) return notFound("Merchant");

    timer.point("merchant.update (soft delete)");
    await prisma.merchant.update({
      where: { id },
      data: { deletedAt: new Date(), status: "ARCHIVED" },
    });

    timer.point("createAuditLog");
    await createAuditLog(
      fromCurrentUser(user, "MERCHANT_DELETED", "merchant", id, {
        changes: {},
      }),
    );

    timer.section("Serialization");
    timer.point("NextResponse.json");
    timer.end();
    return NextResponse.json({
      success: true,
      data: null,
      message: "Merchant deleted successfully",
    });
  } catch (error) {
    timer.end();
    return internalError(error);
  }
}
