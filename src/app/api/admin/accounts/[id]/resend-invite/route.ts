import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAuditData, fromCurrentUser } from "@/services/audit-log.service";
import { canManageTarget } from "@/lib/access/account-access";
import {
  apiError,
  requireAccountAccess,
  resendAdminInvite,
} from "../../helpers";

// POST /api/admin/accounts/[id]/resend-invite — only for admins who never logged in.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountAccess();
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const { id } = await params;

    const account = await prisma.account.findUnique({
      where: { authUserId: id },
    });
    if (!account || account.profileType !== "ADMIN")
      return apiError(404, "NOT_FOUND", "Admin not found");
    const admin = await prisma.adminUser.findFirst({
      where: { accountId: id },
      select: { lastLoginAt: true, role: true },
    });
    if (!admin) return apiError(404, "NOT_FOUND", "Admin profile not found");

    if (
      !canManageTarget(
        { email: user.email, adminRole: user.adminRole },
        { email: account.email, role: admin.role },
      )
    )
      return apiError(403, "FORBIDDEN", "You cannot manage this admin account");
    if (account.lastLoginAt || admin.lastLoginAt) {
      return apiError(
        409,
        "ALREADY_LOGGED_IN",
        "This admin has already logged in",
      );
    }

    if (!(await resendAdminInvite(account.email))) {
      return apiError(
        502,
        "INVITE_FAILED",
        "Could not send the invitation email. Please try again.",
      );
    }

    await prisma.auditLog.create({
      data: buildAuditData(
        fromCurrentUser(user, "ADMIN_INVITE_RESENT", "account", id, {
          metadata: { email: account.email },
        }),
      ) as any,
    });

    return NextResponse.json({
      success: true,
      message: "Invitation sent again",
    });
  } catch (error) {
    console.error("[POST /api/admin/accounts/[id]/resend-invite]", error);
    return apiError(500, "INTERNAL", "Internal server error");
  }
}
