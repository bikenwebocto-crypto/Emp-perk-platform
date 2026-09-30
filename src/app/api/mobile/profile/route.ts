import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { internalError, notFound, badRequest } from "@/lib/employee-helpers";
import { getAuthenticatedMobileEmployee } from "@/lib/mobile-auth";
import { createAuditLog } from "@/services/audit-log.service";
import { uploadImage, EMPLOYEE_AVATAR_OPTIONS } from "@/lib/upload/image";

const ADDRESS_FIELDS = [
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
] as const;

// GET /api/mobile/profile — lightweight employee profile for the mobile Profile tab.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request);
    if (!auth.ok) return auth.response;

    const [redemptionStats, merchantRedemptions, address, savedOffers] =
      await Promise.all([
        prisma.redemption.aggregate({
          where: { employeeId: auth.employee.id },
          _count: { _all: true },
          _sum: { savingsAmount: true },
        }),

        prisma.redemption.findMany({
          where: { employeeId: auth.employee.id },
          select: { merchantId: true },
          distinct: ["merchantId"],
        }),

        prisma.employeeAddress.findUnique({
          where: { employeeId: auth.employee.id },
        }),

        prisma.notificationEvent.count({
          where: {
            employeeId: auth.employee.id,
            referenceType: "saved_offer",
          },
        }),
      ]);

    const countOfRedemption = redemptionStats._count._all;
    const totalRedemptionAmount = Number(
      redemptionStats._sum.savingsAmount ?? 0,
    );

    return NextResponse.json({
      success: true,
      data: {
        id: auth.employee.id,
        firstName: auth.employee.firstName,
        lastName: auth.employee.lastName,
        employeeId: auth.employee.employeeId,
        avatarUrl: auth.employee.avatarUrl,
        department: auth.employee.department,
        jobTitle: auth.employee.jobTitle,
        status: auth.employee.status,
        phone: auth.employee?.phone,
        count_of_redemption: countOfRedemption,
        count_of_merchant_itredeemed: merchantRedemptions.length,
        offerSavedCount: savedOffers,
        TotalRedemptionAmount: totalRedemptionAmount,
        address: address
          ? {
              addressLine1: address.addressLine1,
              addressLine2: address.addressLine2,
              city: address.city,
              state: address.state,
              postalCode: address.postalCode,
              country: address.country,
            }
          : null,
        company: {
          id: auth.company.id,
          name: auth.company.name,
          logoUrl: auth.company.logoUrl,
        },
        account: {
          email: auth.account.email,
        },
      },
    });
  } catch (error) {
    return internalError(error);
  }
}

// PATCH /api/mobile/profile — update profile fields from multipart form-data.
// Text fields: firstName, lastName, phone, jobTitle, department,
//              addressLine1, addressLine2, city, state, postalCode, country.
// File field: avatar (single image, uploaded to Supabase Storage).
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request);
    if (!auth.ok) return auth.response;

    const form = await request.formData();

    const personalAllowed = [
      "firstName",
      "lastName",
      "phone",
      "jobTitle",
      "department",
    ] as const;

    const personalUpdate: Record<string, unknown> = {};
    for (const f of personalAllowed) {
      const val = form.get(f);
      if (val !== null && typeof val === "string") personalUpdate[f] = val;
    }

    const avatarFile = form.get("avatar");
    if (avatarFile && avatarFile instanceof File && avatarFile.size > 0) {
      const url = await uploadImage(avatarFile, EMPLOYEE_AVATAR_OPTIONS);
      personalUpdate.avatarUrl = url;
    }

    const addressUpdate: Record<string, unknown> = {};
    for (const f of ADDRESS_FIELDS) {
      const val = form.get(f);
      if (val !== null && typeof val === "string") addressUpdate[f] = val;
    }

    if (
      Object.keys(personalUpdate).length === 0 &&
      Object.keys(addressUpdate).length === 0
    ) {
      return NextResponse.json({ success: true, message: "No changes" });
    }

    if (
      personalUpdate.firstName !== undefined &&
      (!personalUpdate.firstName ||
        String(personalUpdate.firstName).trim().length < 1)
    ) {
      return badRequest("First name is required");
    }
    if (
      personalUpdate.lastName !== undefined &&
      (!personalUpdate.lastName ||
        String(personalUpdate.lastName).trim().length < 1)
    ) {
      return badRequest("Last name is required");
    }

    if (Object.keys(personalUpdate).length > 0) {
      await prisma.employee.update({
        where: { id: auth.employee.id },
        data: personalUpdate,
      });
    }

    if (Object.keys(addressUpdate).length > 0) {
      await prisma.employeeAddress.upsert({
        where: { employeeId: auth.employee.id },
        create: {
          employeeId: auth.employee.id,
          addressLine1: (addressUpdate.addressLine1 as string) ?? null,
          addressLine2: (addressUpdate.addressLine2 as string) ?? null,
          city: (addressUpdate.city as string) ?? null,
          state: (addressUpdate.state as string) ?? null,
          postalCode: (addressUpdate.postalCode as string) ?? null,
          country: (addressUpdate.country as string) ?? null,
        },
        update: addressUpdate,
      });
    }

    const updated = await prisma.employee.findUnique({
      where: { id: auth.employee.id },
      include: {
        account: { select: { email: true } },
        address: true,
      },
    });

    void createAuditLog({
      actorType: "employee",
      actorId: auth.employee.id,
      action: "EMPLOYEE_PROFILE_UPDATED",
      entityType: "employee",
      entityId: auth.employee.id,
      metadata: {
        changed: Object.keys(personalUpdate),
        addressChanged: Object.keys(addressUpdate),
        loginSource: "mobile",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        email: updated?.account?.email ?? "",
        address: updated?.address
          ? {
              addressLine1: updated.address.addressLine1,
              addressLine2: updated.address.addressLine2,
              city: updated.address.city,
              state: updated.address.state,
              postalCode: updated.address.postalCode,
              country: updated.address.country,
            }
          : null,
      },
    });
  } catch (error) {
    return internalError(error);
  }
}
