import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildAuditData, fromCurrentUser } from "@/services/audit-log.service";
import {
  ACTIVE_ADMIN_ROLES,
  ADMIN_ROLES,
  assignableRoles,
  canManageTarget,
} from "@/lib/access/account-access";
import { apiError, requireAccountAccess } from "../helpers";
import { getAdminClient } from "@/lib/supabase/admin";

const patchSchema = z
  .object({
    role: z.enum(ACTIVE_ADMIN_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((b) => b.role !== undefined || b.isActive !== undefined, {
    message: "Nothing to update",
  });

class LastSuperAdminError extends Error {}

// PATCH /api/admin/accounts/[id] — change a system admin's role and/or
// activate / deactivate them. [id] is Account.authUserId.
// Body: { role?: AdminRole, isActive?: boolean }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountAccess();
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const { id } = await params;

    const parsed = patchSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success)
      return apiError(
        400,
        "VALIDATION",
        parsed.error.issues[0]?.message ?? "Invalid input",
      );
    const { role, isActive } = parsed.data;

    const account = await prisma.account.findUnique({
      where: { authUserId: id },
    });
    if (!account || account.profileType !== "ADMIN")
      return apiError(404, "NOT_FOUND", "Admin not found");
    const admin = await prisma.adminUser.findFirst({
      where: { accountId: id },
    });
    if (!admin) return apiError(404, "NOT_FOUND", "Admin profile not found");

    // Don't let a super admin lock themselves out.
    if (
      account.authUserId === user.id ||
      account.email.toLowerCase() === user.email?.toLowerCase()
    ) {
      return apiError(
        400,
        "SELF_CHANGE",
        "You cannot change your own role or status",
      );
    }

    // An ADMIN may not touch a SUPER_ADMIN; nobody may touch themselves.
    if (
      !canManageTarget(
        { email: user.email, adminRole: user.adminRole },
        { email: account.email, role: admin.role },
      )
    ) {
      return apiError(403, "FORBIDDEN", "You cannot manage this admin account");
    }
    // A new role must stay inside what the actor may hand out.
    if (
      role !== undefined &&
      !assignableRoles({ adminRole: user.adminRole }).includes(role)
    ) {
      return apiError(403, "FORBIDDEN", "You cannot assign this role");
    }

    const nextRole = role ?? admin.role;
    const nextActive = isActive ?? admin.isActive;
    const losesSuper =
      admin.role === "SUPER_ADMIN" &&
      admin.isActive &&
      (nextRole !== "SUPER_ADMIN" || !nextActive);

    await prisma.$transaction(
      async (tx) => {
        if (losesSuper) {
          // At least one other active SUPER_ADMIN (with an active Account) must remain.
          const others = await tx.adminUser.findMany({
            where: {
              role: "SUPER_ADMIN",
              isActive: true,
              accountId: { not: null },
              id: { not: admin.id },
            },
            select: { accountId: true },
          });
          const remaining = await tx.account.count({
            where: {
              authUserId: { in: others.map((a) => a.accountId!) },
              status: "ACTIVE",
            },
          });
          if (remaining === 0) throw new LastSuperAdminError();
        }

        await tx.adminUser.update({
          where: { id: admin.id },
          data: {
            ...(role !== undefined && { role }),
            ...(isActive !== undefined && { isActive }),
          },
        });
        await tx.account.update({
          where: { authUserId: id },
          data: {
            ...(isActive !== undefined && {
              status: isActive ? "ACTIVE" : "INACTIVE",
            }),
            changedBy: user.id,
          },
        });
        if (isActive === false) {
          await tx.loginSession.updateMany({
            where: { adminId: admin.id, isActive: true },
            data: { isActive: false },
          });
        }

        await tx.auditLog.create({
          data: buildAuditData(
            fromCurrentUser(user, "ADMIN_ACCOUNT_UPDATED", "account", id, {
              changes: {
                before: {
                  role: admin.role,
                  isActive: admin.isActive,
                  status: account.status,
                },
                after: {
                  role: nextRole,
                  isActive: nextActive,
                  status:
                    isActive === undefined
                      ? account.status
                      : isActive
                        ? "ACTIVE"
                        : "INACTIVE",
                },
              },
            }),
          ) as any,
        });
      },
      { isolationLevel: "Serializable" },
    );
    if (isActive === false) {
      try {
        await getAdminClient().auth.admin.signOut(id);
      } catch (e) {
        console.error("[PATCH /api/admin/accounts/[id]] signOut failed", e);
      }
    }
    return NextResponse.json({ success: true, message: "Admin updated" });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2034") {
      return apiError(
        409,
        "CONFLICT",
        "Another change happened at the same time. Please try again.",
      );
    }
    if (error instanceof LastSuperAdminError) {
      return apiError(
        409,
        "LAST_SUPER_ADMIN",
        "At least one active super admin must remain",
      );
    }
    console.error("[PATCH /api/admin/accounts/[id]]", error);
    return apiError(500, "INTERNAL", "Internal server error");
  }
}
