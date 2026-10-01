import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/supabase/server";
import { createAuditLog } from "@/services/audit-log.service";
import {
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

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "VALIDATION", message } },
    { status: 400 },
  );
}

function internalError(error: unknown) {
  console.error("Admin complaint detail error:", error);
  return NextResponse.json(
    {
      success: false,
      error: { code: "INTERNAL", message: "Internal server error" },
    },
    { status: 500 },
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "admin") return unauthorized();

    const { id } = await params;

    const includeShape = {
      offer: { select: { id: true, title: true, status: true, offerType: true } },
      merchant: { select: { id: true, businessName: true, logoUrl: true, city: true, state: true } },
      employee: { select: { id: true, firstName: true, lastName: true } },
      company: { select: { id: true, name: true, email: true } },
      actions: { orderBy: { createdAt: "desc" } as const },
      escalations: {
        orderBy: { createdAt: "desc" as const },
        include: {
          companyAdmin: { select: { id: true, firstName: true, lastName: true } },
          superAdmin: { select: { id: true } },
        },
      },
    };

    let complaint = await prisma.complaint.findUnique({ where: { id }, include: includeShape });
    if (!complaint) return notFound("Complaint");

    // First admin view moves an OPEN ticket into review automatically —
    // no separate "Start Review" action, opening the ticket IS the action.
    if (complaint.status === "OPEN") {
      const adminId = user.profileId ?? user.id;
      await prisma.$transaction(async (tx) => {
        await tx.complaint.update({
          where: { id },
          data: { status: "UNDER_REVIEW", updatedAt: new Date() },
        });
        await tx.complaintAction.create({
          data: {
            complaintId: id,
            actorType: "SUPER_ADMIN",
            adminId,
            actionType: "REVIEW_STARTED",
            notes: "Opened by admin",
          },
        });
      });
      complaint = await prisma.complaint.findUnique({ where: { id }, include: includeShape });
    }

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
    const user = await getCurrentUser();
    if (!user || user.userType !== "admin") return unauthorized();

    const { id } = await params;
    const body = await request.json();
    const { status, resolutionNotes } = body;

    if (!status || !["RESOLVED", "REJECTED"].includes(status)) {
      return badRequest("Status must be RESOLVED or REJECTED");
    }

    const complaint = await prisma.complaint.findUnique({ where: { id } });
    if (!complaint) return notFound("Complaint");

    if (complaint.status !== "UNDER_REVIEW" && complaint.status !== "ESCALATED") {
      return badRequest(
        `Cannot ${status.toLowerCase()} a complaint from status ${complaint.status}. ` +
          `Only complaints in UNDER_REVIEW or ESCALATED can be resolved or rejected.`,
      );
    }

    // Capture which company admin(s), if any, escalated this ticket —
    // needed to notify them after resolution. Read before the escalations
    // get closed out below, since updateMany doesn't return affected rows.
    const pendingEscalations = await prisma.complaintEscalation.findMany({
      where: { complaintId: id, status: "PENDING" },
      select: { companyAdminId: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.complaint.update({
        where: { id },
        data: {
          status,
          resolutionNotes: resolutionNotes ?? null,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Close out pending escalations on EITHER outcome, not just RESOLVED —
      // a rejected complaint's escalation shouldn't stay PENDING forever.
      if (pendingEscalations.length > 0) {
        await tx.complaintEscalation.updateMany({
          where: { complaintId: id, status: "PENDING" },
          data: {
            status: status === "RESOLVED" ? "RESOLVED" : "REJECTED",
            superAdminId: user.profileId ?? user.id,
            resolvedAt: new Date(),
          },
        });
      }

      await tx.complaintAction.create({
        data: {
          complaintId: id,
          actorType: "SUPER_ADMIN",
          adminId: user.profileId ?? user.id,
          actionType: status === "RESOLVED" ? "RESOLVED" : "REJECTED",
          notes: resolutionNotes ?? null,
        },
      });

      return updated;
    });

    await createAuditLog({
      actorType: "admin",
      actorId: user.profileId ?? user.id,
      action:
        status === "RESOLVED" ? "COMPLAINT_RESOLVED" : "COMPLAINT_REJECTED",
      entityType: "COMPLAINT",
      entityId: id,
      metadata: { previousStatus: complaint.status, resolutionNotes },
    });

    if (result.employeeId) {
      await publishBusinessNotification({
        type: "COMPLAINT_UPDATED",
        title:
          status === "RESOLVED" ? "Complaint resolved" : "Complaint update",
        message:
          status === "RESOLVED"
            ? "Your complaint has been resolved."
            : "Your complaint was reviewed and closed.",
        priority: "NORMAL",
        recipients: [{ role: "employee", id: result.employeeId }],
        channels: channels("IN_APP", "PUSH"),
        referenceType: complaint.complaintType === "APPLICATION_SUPPORT" ? "application_ticket" : "offer_ticket",
        referenceId: result.id,
        metadata: { status, resolutionNotes: resolutionNotes ?? null },
      });
    }

    // Notify the company admin(s) who escalated this ticket, if any.
    // ASSUMPTION — unverified: business-notification.service may or may
    // not support role: 'company_admin' as a recipient. Confirm against
    // the real service file before relying on this in production.
    const uniqueCompanyAdminIds = [
      ...new Set(pendingEscalations.map((e) => e.companyAdminId)),
    ];
    for (const companyAdminId of uniqueCompanyAdminIds) {
      await publishBusinessNotification({
        type: "COMPLAINT_UPDATED",
        title:
          status === "RESOLVED"
            ? "Escalated complaint resolved"
            : "Escalated complaint rejected",
        message:
          status === "RESOLVED"
            ? "The complaint you escalated has been resolved by an admin."
            : "The complaint you escalated has been reviewed and rejected.",
        priority: "NORMAL",
        recipients: [{ role: "company_admin", id: companyAdminId }],
        channels: channels("IN_APP", "PUSH"),
        referenceType: "complaint",
        referenceId: result.id,
        metadata: { status, resolutionNotes: resolutionNotes ?? null },
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return internalError(error);
  }
}