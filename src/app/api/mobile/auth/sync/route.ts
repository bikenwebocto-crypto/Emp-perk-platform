import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthenticatedMobileEmployee,
  buildMobileAuthProfile,
} from "@/lib/mobile-auth";
import { activateDeviceToken } from "@/lib/device-token.service";
import { createAuditLog } from "@/services/audit-log.service";
import { internalError } from "@/lib/employee-helpers";

// POST /api/mobile/auth/sync
//
// Validates the Supabase Bearer token via the shared
// `getAuthenticatedMobileEmployee` helper, refreshes the login
// timestamps on Account + Employee, records an audit entry, and
// returns the mobile employee profile.
//
// Optional body fields (both captured for audit only — no schema
// column exists for them today):
//   - fcmToken: push-notification token
//   - deviceId: identifier of the mobile device
//
// Response is the employee profile only. No custom JWT is generated;
// Supabase's access_token is the only token the mobile app needs.
export async function POST(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();

    console.log("[mobile/auth/sync] START", requestId);
    // 1. Read optional body (best-effort — never fail on empty body).
    let deviceId: string | null = null;
    let fcmToken: string | null = null;
    try {
      const body = await request.json();
      if (
        body &&
        typeof body.deviceId === "string" &&
        body.deviceId.length > 0
      ) {
        deviceId = body.deviceId;
      }
      if (
        body &&
        typeof body.fcmToken === "string" &&
        body.fcmToken.length > 0
      ) {
        fcmToken = body.fcmToken;
      }
    } catch {
      // Empty body is fine.
    }

    // 2. Authenticate + load Account / Employee / Company.
    const auth = await getAuthenticatedMobileEmployee(request);
    if (!auth.ok) return auth.response;
    const { account, employee, company } = auth;

    // 3. Refresh login timestamps + persist the device token (best-effort,
    // never block the login).
    await Promise.all([
      prisma.account
        .update({
          where: { authUserId: account.authUserId },
          data: { lastLoginAt: new Date() },
        })
        .catch(() => null),
      prisma.employee
        .update({
          where: { id: employee.id },
          data: { lastLoginAt: new Date() },
        })
        .catch(() => null),
      fcmToken
        ? activateDeviceToken({
            userId: account.authUserId,
            token: fcmToken,
            deviceId,
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    // 4. Audit log — fire-and-forget, never blocks the response.
    void createAuditLog({
      actorType: "employee",
      actorId: employee.id,
      action: "MOBILE_AUTH_SYNC",
      entityType: "employee",
      entityId: employee.id,
      metadata: {
        employeeId: employee.id,
        companyId: company.id,
        accountId: account.authUserId,
        deviceId,
        hasFcmToken: !!fcmToken,
        loginSource: "mobile",
      },
    });

    // 5. Return the mobile profile. No JWT, no redirect URL.
    return NextResponse.json({
      success: true,
      data: buildMobileAuthProfile(account, employee, company),
    });
  } catch (error) {
    return internalError(error);
  }
}
