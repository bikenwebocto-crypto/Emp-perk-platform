import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyAdmin, handleApiError, AuthError } from "../helpers";
import { validateUserEmail } from "@/services/user-validation.service";
import { inviteAuthUser, rollbackAuthUser } from "@/services/employee-invite.service";

export async function GET(request: NextRequest) {
  try {
    const { company } = await getCompanyAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20")),
    );
    const status = searchParams.get("status");
    const q = searchParams.get("q");
    const sortBy = searchParams.get("sortBy") ?? "createdAt";
    const sortOrder = (searchParams.get("sortOrder") ?? "desc") as
      | "asc"
      | "desc";

    const where: any = { companyId: company.id, deletedAt: null };
    if (status && status !== "ALL") where.status = status;
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { department: { contains: q, mode: "insensitive" } },
      ];
    }

    const orderBy: any = {};
    const sortMap: Record<string, string> = {
      firstName: "firstName",
      lastName: "lastName",
      department: "department",
      status: "status",
      createdAt: "createdAt",
    };
    const sortField = sortMap[sortBy] ?? "createdAt";
    orderBy[sortField] = sortOrder;

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          department: true,
          jobTitle: true,
          status: true,
          employeeId: true,
          createdAt: true,
          invitedAt: true,
          lastLoginAt: true,
          joinMethod: true,

          account: {
            select: {
              email: true,
            },
          },

          _count: {
            select: {
              redemptions: true,
            },
          },
        },
      }),
      prisma.employee.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: employees,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const { company, companyAdmin } = await getCompanyAdmin();
    const body = await request.json().catch(() => null);
    if (!body) return apiError(400, "VALIDATION", "Invalid request body");

    const { firstName, lastName, email, department, jobTitle, phone, employeeId, joinMethod } = body;

    if (!firstName || !lastName || typeof email !== "string" || !email.trim()) {
      return apiError(400, "VALIDATION", "First name, last name, and email are required");
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return apiError(400, "INVALID_EMAIL", "Invalid email address");
    }

    if (company.approvedDomain) {
      const domain = normalizedEmail.split("@")[1];
      if (domain !== company.approvedDomain.toLowerCase()) {
        return apiError(400, "DOMAIN_MISMATCH", `Email domain must be ${company.approvedDomain}`);
      }
    }

    const validation = await validateUserEmail(normalizedEmail);
    if (validation.exists) {
      return apiError(409, "EMAIL_ALREADY_EXISTS", "Email is already assigned to another account");
    }

    // 1. Create Supabase user + send invite email FIRST
    const invite = await inviteAuthUser(normalizedEmail, {
      role: "EMPLOYEE",
      firstName,
      companyName: company.name,
    });
    if (!invite.ok) {
      const status = invite.code === "EMAIL_EXISTS" ? 409 : 502;
      return apiError(status, invite.code, invite.message);
    }

    const authUserId = invite.authUserId;
    const empId = employeeId || `EMP-${Date.now()}`;

    // 2. Save to DB using the Supabase user id
    let employee;
    try {
      employee = await prisma.$transaction(async (tx) => {
        await tx.account.create({
          data: {
            authUserId,
            email: normalizedEmail,
            role: "EMPLOYEE",
            profileType: "EMPLOYEE",
            status: "ACTIVE",
          },
        });

        const created = await tx.employee.create({
          data: {
            id: authUserId,
            companyId: company.id,
            accountId: authUserId,
            firstName,
            lastName,
            employeeId: empId,
            department: department || null,
            jobTitle: jobTitle || null,
            phone: phone || null,
            status: "ACTIVE",
            joinMethod: joinMethod || "manual",
            invitedAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            actorType: "COMPANY_ADMIN",
            companyId: company.id,
            action: "EMPLOYEE_CREATED",
            entityType: "EMPLOYEE",
            entityId: created.id,
            metadata: { createdBy: companyAdmin.id, firstName, lastName, department, invited: true },
          },
        });

        return created;
      });
    } catch (dbError) {
      // 3. DB failed → remove the Supabase user so nothing is left half-created
      await rollbackAuthUser(authUserId);
      throw dbError;
    }

    return NextResponse.json(
      { success: true, data: employee, message: "Employee created and invitation sent" },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}