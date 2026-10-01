import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getEmployeeFromSession,
  unauthorized as empUnauthorized,
  companyInactive,
  notFound as empNotFound,
  badRequest as empBadRequest,
  internalError as empInternalError,
} from "@/lib/employee-session";
import { getCurrentUser } from "@/lib/supabase/server";
import { getMerchantFromSession } from "@/lib/merchant-session";
import { getCompanyAdmin, handleApiError } from "@/app/api/company/helpers";
import { createAuditLog } from "@/services/audit-log.service";

function unauthorized() {
  return NextResponse.json(
    {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    },
    { status: 401 },
  );
}

function notFound(message = "Not found") {
  return NextResponse.json(
    { success: false, error: { code: "NOT_FOUND", message } },
    { status: 404 },
  );
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "VALIDATION", message } },
    { status: 400 },
  );
}

function internalError(error: unknown) {
  console.error("Complaint detail error:", error);
  return NextResponse.json(
    {
      success: false,
      error: { code: "INTERNAL", message: "Internal server error" },
    },
    { status: 500 },
  );
}

async function resolveRequester() {
  // Try employee first
  const employee = await getEmployeeFromSession();
  if (employee && !("inactive" in employee))
    return {
      role: "employee" as const,
      id: employee.id,
      companyId: employee.companyId,
      employee,
    };

  // Try company admin
  try {
    const ca = await getCompanyAdmin();
    return {
      role: "company_admin" as const,
      id: ca.companyAdmin.id,
      companyId: ca.company.id,
      companyAdmin: ca.companyAdmin,
      company: ca.company,
    };
  } catch {
    /* not company admin */
  }

  // Try merchant
  const merchant = await getMerchantFromSession();
  if (merchant)
    return {
      role: "merchant" as const,
      id: merchant.id,
      merchantId: merchant.id,
      merchant,
    };

  // Try super admin
  const user = await getCurrentUser();
  if (user && user.userType === "admin")
    return { role: "admin" as const, id: user.profileId ?? user.id, user };

  return null;
}

type Requester = Awaited<ReturnType<typeof resolveRequester>>;

function canAccess(complaint: any, requester: NonNullable<Requester>): boolean {
  switch (requester.role) {
    case "employee":
      return complaint.employeeId === requester.id;
    case "company_admin":
      return complaint.companyId === requester.companyId;
    case "merchant":
      return complaint.merchantId === requester.merchantId;
    case "admin":
      return true;
    default:
      return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const requester = await resolveRequester();
    if (!requester) return unauthorized();

    const { id } = await params;

    const complaint = await prisma.complaint.findUnique({
      where: { id },
      include: {
        offer: { select: { id: true, title: true, status: true } },
        merchant: { select: { id: true, businessName: true, logoUrl: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
        company: { select: { id: true, name: true, email: true } },
        actions: { orderBy: { createdAt: "desc" } },
        escalations: {
          orderBy: { createdAt: "desc" },
          include: {
            companyAdmin: {
              select: { id: true, firstName: true, lastName: true },
            },
            superAdmin: { select: { id: true } },
          },
        },
      },
    });

    if (!complaint) return notFound("Complaint not found");
    if (!canAccess(complaint, requester))
      return notFound("Complaint not found");

    return NextResponse.json({ success: true, data: complaint });
  } catch (error) {
    return internalError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const requester = await resolveRequester();
    if (!requester) return unauthorized();

    const { id } = await params;
    const body = await request.json();

    const complaint = await prisma.complaint.findUnique({ where: { id } });
    if (!complaint) return notFound("Complaint not found");
    if (!canAccess(complaint, requester))
      return notFound("Complaint not found");

    const updateData: any = {};
    const actionData: any = { complaintId: id };

    if (requester.role === "company_admin") {
      if (body.priority) {
        if (!["LOW", "MEDIUM", "HIGH"].includes(body.priority)) {
          return badRequest("Invalid priority. Must be LOW, MEDIUM, or HIGH");
        }
        updateData.priority = body.priority;
        actionData.actorType = "COMPANY_ADMIN";
        actionData.companyAdminId = requester.id;
        actionData.actionType = "REVIEWED";
        actionData.notes = "Priority updated";
      }
      if (body.escalationNote !== undefined) {
        updateData.escalationNote = body.escalationNote;
        actionData.actorType = "COMPANY_ADMIN";
        actionData.companyAdminId = requester.id;
        actionData.actionType = "REVIEWED";
        actionData.notes = "Escalation note added";
      }
    }

    if (requester.role === "merchant") {
      if (body.response) {
        updateData.status =
          complaint.status === "CLARIFICATION_REQ"
            ? "UNDER_REVIEW"
            : complaint.status;
        actionData.actorType = "MERCHANT";
        actionData.merchantId = requester.id;
        actionData.actionType = "RESPONDED";
        actionData.notes = body.response;
      }
    }

    if (requester.role === "admin") {
      if (body.status) {
        const validStatuses = [
          "RESOLVED",
          "REJECTED",
          "UNDER_REVIEW",
          "CLARIFICATION_REQ",
        ];
        if (!validStatuses.includes(body.status)) {
          return badRequest("Invalid status");
        }

        // RESOLVED/REJECTED is only valid from UNDER_REVIEW — same guard as
        // /api/complaints/admin/[id]. This route was missing it, allowing a
        // ticket to be resolved/rejected directly from OPEN, CLARIFICATION_REQ,
        // or ESCALATED, skipping the review step entirely.
        if (
          (body.status === "RESOLVED" || body.status === "REJECTED") &&
          complaint.status !== "UNDER_REVIEW"
        ) {
          return badRequest(
            `Cannot ${body.status.toLowerCase()} a complaint from status ${complaint.status}. ` +
              `Only complaints in UNDER_REVIEW can be resolved or rejected.`,
          );
        }

        updateData.status = body.status;
        if (body.status === "RESOLVED" || body.status === "REJECTED") {
          updateData.resolvedAt = new Date();
        }
        actionData.actorType = "SUPER_ADMIN";
        actionData.adminId = requester.id;
        actionData.actionType =
          body.status === "RESOLVED"
            ? "RESOLVED"
            : body.status === "REJECTED"
              ? "REJECTED"
              : "REVIEWED";
        actionData.notes = body.resolutionNotes ?? null;
      }
      if (body.resolutionNotes !== undefined) {
        updateData.resolutionNotes = body.resolutionNotes;
        if (!actionData.actorType) {
          actionData.actorType = "SUPER_ADMIN";
          actionData.adminId = requester.id;
          actionData.actionType = "REVIEWED";
          actionData.notes = body.resolutionNotes;
        }
      }
    }

    if (Object.keys(updateData).length === 0)
      return badRequest("No valid fields to update");

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.complaint.update({
        where: { id },
        data: { ...updateData, updatedAt: new Date() },
      });

      if (actionData.actionType) {
        await tx.complaintAction.create({ data: actionData });
      }

      return updated;
    });

    await createAuditLog({
      actorType:
        requester.role === "company_admin"
          ? "company_admin"
          : requester.role === "merchant"
            ? "merchant"
            : requester.role === "employee"
              ? "employee"
              : "admin",
      actorId: requester.id,
      action: "COMPLAINT_UPDATED",
      entityType: "COMPLAINT",
      entityId: id,
      metadata: { updates: Object.keys(updateData), note: actionData.notes },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return internalError(error);
  }
}
