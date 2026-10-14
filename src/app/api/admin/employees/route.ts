import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/supabase/server";
import { adminEmployeeActionSchema } from "@/schemas";
import { createAuditLog, fromCurrentUser } from "@/services/audit-log.service";
import { validateUserEmail } from "@/services/user-validation.service";
import { createPerfTimer } from "@/lib/perf";
import { channels, publishBusinessNotification } from '@/services/business-notification.service';
import { inviteAuthUser, inviteErrorStatus, normalizeEmail, rollbackAuthUser } from '@/services/employee-invite.service';

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
  console.error("Employees API error:", error);
  return NextResponse.json(
    {
      success: false,
      error: { code: "INTERNAL", message: "Internal server error" },
    },
    { status: 500 },
  );
}

// GET /api/admin/employees — list employees with filters
export async function GET(request: NextRequest) {
  const timer = createPerfTimer('GET /api/admin/employees')
  timer.section('Authentication')
  try {
    const user = await getCurrentUser(timer);
    timer.point('user auth check')
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const companyId = searchParams.get("companyId");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20")));
    const q = searchParams.get("q");

    const where: Record<string, unknown> = { deletedAt: null };
    if (status && status !== "ALL") where.status = status;
    if (companyId && companyId !== "ALL") where.companyId = companyId;
    let matchingAccountIds: string[] = [];

    timer.section('Search Query')
    if (q) {
      timer.point('account.findMany (email search)')
      const matchingAccounts = await prisma.account.findMany({
        where: { email: { contains: q, mode: "insensitive" } },
        select: { authUserId: true },
      });
      matchingAccountIds = matchingAccounts.map((a) => a.authUserId);
      (where as any).OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ];
      if (matchingAccountIds.length > 0) {
        (where as any).OR.push({ accountId: { in: matchingAccountIds } });
      }
    }

    timer.section('Database Queries')
    timer.point('employee.findMany + employee.count')
    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where: where as any,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          company: { select: { id: true, name: true, slug: true } },
          account: { select: { authUserId: true, email: true, status: true } },
          _count: { select: { redemptions: true } },
        },
      }),
      prisma.employee.count({ where: where as any }),
    ]);

    timer.section('Serialization')
    timer.point('NextResponse.json')
    timer.end()
    return NextResponse.json({
      success: true, data: employees,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), hasNextPage: page * pageSize < total, hasPreviousPage: page > 1 },
    });
  } catch (error) {
    timer.end()
    return internalError(error);
  }
}

// POST /api/admin/employees — create a single employee
export async function POST(request: NextRequest) {
  const timer = createPerfTimer('POST /api/admin/employees')
  timer.section('Authentication')
  try {
    const user = await getCurrentUser(timer);
    timer.point('user auth check')
    if (!user || user.userType !== "admin") return unauthorized();

    const body = await request.json();
    const { email, firstName, lastName, companyId, department, jobTitle, employeeId, phone, joinMethod } = body;

    if (!email || !firstName || !lastName || !companyId) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION", message: "Missing required fields: email, firstName, lastName, companyId" } },
        { status: 400 },
      );
    }

    timer.section('Validation')
    timer.point('company.findUnique')
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.deletedAt) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Company not found" } },
        { status: 404 },
      );
    }

    const normalizedEmail = normalizeEmail(email);

    timer.point('validateUserEmail')
    const validation = await validateUserEmail(normalizedEmail);
    if (validation.exists) {
      return NextResponse.json(
        { success: false, error: { code: "EMAIL_ALREADY_EXISTS", message: "Email is already assigned to another account" } },
        { status: 409 },
      );
    }

    // Invite first: creates the Supabase user and sends the invite email.
    // Its id becomes the account/employee id.
    timer.point('inviteAuthUser')
    const invite = await inviteAuthUser(normalizedEmail, { role: 'EMPLOYEE', firstName, companyName: company.name });
    if (!invite.ok) {
      return NextResponse.json(
        { success: false, error: { code: invite.code, message: invite.message } },
        { status: inviteErrorStatus(invite.code) },
      );
    }
    const pkId = invite.authUserId;

    timer.section('Database Queries')
    timer.point('$transaction (account + employee + audit)')
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        await tx.account.create({ data: { authUserId: pkId, email: normalizedEmail, role: "EMPLOYEE", profileType: "EMPLOYEE", status: "ACTIVE" } });
        const employee = await tx.employee.create({ data: { id: pkId, accountId: pkId, companyId, firstName, lastName, employeeId, department, jobTitle, phone, joinMethod: joinMethod || "manual", status: "ACTIVE", invitedAt: new Date(), invitedBy: user.id }, include: { company: { select: { id: true, name: true } } } });
        await createAuditLog(fromCurrentUser(user, "EMPLOYEE_CREATED", "employee", employee.id, { changes: { email: normalizedEmail, companyId, department } }));
        return employee;
      });
    } catch (dbError) {
      await rollbackAuthUser(pkId);
      throw dbError;
    }

    // The invite email comes from Supabase; this is the in-app record only.
    await publishBusinessNotification({
      type: 'EMPLOYEE_INVITED',
      title: `Invitation to ${result.company.name}`,
      message: 'You have been invited to join your company benefits account.',
      priority: 'NORMAL',
      recipients: [{ role: 'employee', id: result.id }],
      channels: channels('IN_APP'),
      referenceType: 'employee',
      referenceId: result.id,
      metadata: { companyId, invitedBy: user.id },
    });

    timer.section('Serialization')
    timer.point('NextResponse.json')
    timer.end()
    return NextResponse.json({ success: true, data: result, message: "Employee created successfully" }, { status: 201 });
  } catch (error: any) {
    timer.end()
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: { code: "CONFLICT", message: "An employee with this email already exists" } },
        { status: 409 },
      );
    }
    return internalError(error);
  }
}

// PATCH /api/admin/employees — bulk update employee status
export async function PATCH(request: NextRequest) {
  const timer = createPerfTimer('PATCH /api/admin/employees')
  timer.section('Authentication')
  try {
    const user = await getCurrentUser(timer);
    timer.point('user auth check')
    if (!user || user.userType !== "admin") return unauthorized();

    const body = await request.json();
    const { employeeIds, status, reason } = body;

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION", message: "employeeIds must be a non-empty array" } },
        { status: 400 },
      );
    }

    if (!status || !["ACTIVE", "INACTIVE", "SUSPENDED", "INELIGIBLE"].includes(status)) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION", message: "Invalid status. Must be one of: ACTIVE, INACTIVE, SUSPENDED, INELIGIBLE" } },
        { status: 400 },
      );
    }

    timer.section('Database Queries')
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds }, deletedAt: null },
      select: { id: true, status: true },
    });
    timer.point('employee.updateMany')
    const result = await prisma.employee.updateMany({
      where: { id: { in: employeeIds }, deletedAt: null },
      data: { status: status as any },
    });

    timer.point('createAuditLog')
    await createAuditLog(fromCurrentUser(user, `EMPLOYEES_BULK_${status}`, "employee", `bulk-${Date.now()}`, { changes: { employeeIds, status, reason, count: result.count } }));

    for (const employee of employees) {
      await publishBusinessNotification({
        type: status === 'ACTIVE' ? 'SYSTEM' : 'EMPLOYEE_REMOVED',
        title: status === 'ACTIVE' ? 'Employee account activated' : `Employee account ${status.toLowerCase()}`,
        message: status === 'ACTIVE'
          ? 'Your employee account has been activated.'
          : `Your employee account status changed to ${status}.`,
        priority: status === 'SUSPENDED' ? 'HIGH' : 'NORMAL',
        recipients: [{ role: 'employee', id: employee.id }],
        channels: channels(status === 'ACTIVE' ? 'IN_APP' : 'EMAIL'),
        referenceType: 'employee',
        referenceId: employee.id,
        metadata: { previousStatus: employee.status, status, reason: reason ?? null },
      });
    }

    timer.section('Serialization')
    timer.point('NextResponse.json')
    timer.end()
    return NextResponse.json({
      success: true, data: { count: result.count },
      message: `${result.count} employee(s) ${status.toLowerCase()} successfully`,
    });
  } catch (error) {
    timer.end()
    return internalError(error);
  }
}

// DELETE /api/admin/employees — soft-delete employees (single via ?id= or bulk via ?ids=a,b,c)
export async function DELETE(request: NextRequest) {
  const timer = createPerfTimer('DELETE /api/admin/employees')
  timer.section('Authentication')
  try {
    const user = await getCurrentUser(timer);
    timer.point('user auth check')
    if (!user || user.userType !== "admin") return unauthorized();

    const { searchParams } = new URL(request.url);
    const singleId = searchParams.get("id");
    const idsParam = searchParams.get("ids");

    let employeeIds: string[];
    if (singleId) {
      employeeIds = [singleId];
    } else if (idsParam) {
      employeeIds = idsParam.split(",").filter(Boolean);
    } else {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION", message: 'Provide "id" for single delete or "ids" (comma-separated) for bulk delete' } },
        { status: 400 },
      );
    }

    if (employeeIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "VALIDATION", message: "At least one employee ID is required" } },
        { status: 400 },
      );
    }

    timer.section('Database Queries')
    timer.point('employee.updateMany')
    const result = await prisma.employee.updateMany({
      where: { id: { in: employeeIds }, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: user.id, status: "INACTIVE" },
    });

    timer.point('createAuditLog')
    await createAuditLog(fromCurrentUser(user, employeeIds.length === 1 ? "EMPLOYEE_DELETED" : "EMPLOYEES_BULK_DELETED", "employee", employeeIds.length === 1 ? employeeIds[0]! : `bulk-${Date.now()}`, { changes: { employeeIds, count: result.count } }));

    timer.section('Serialization')
    timer.point('NextResponse.json')
    timer.end()
    return NextResponse.json({
      success: true, data: { count: result.count },
      message: `${result.count} employee(s) deleted successfully`,
    });
  } catch (error) {
    timer.end()
    return internalError(error);
  }
}
