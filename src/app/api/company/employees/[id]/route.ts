import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyAdmin, handleApiError } from "../../helpers";
import { getCurrentUser } from "@/lib/supabase/server";
import { companyEmployeeUpdateSchema } from "@/schemas";
import { validateUserEmail } from "@/services/user-validation.service";
import { createAuditLog, fromCurrentUser } from "@/services/audit-log.service";
import { emailService } from "@/lib/email/email";
import { deleteImage } from "@/lib/upload/image";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || !["admin", "company_admin"].includes(user.userType)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        },
        { status: 401 },
      );
    }

    const { id } = await params;

    let company = null;
    if (user.userType === "company_admin") {
      const companyContext = await getCompanyAdmin();
      company = companyContext.company;
    }

    const employee = await prisma.employee.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(user.userType === "company_admin"
          ? { companyId: company!.id }
          : {}),
      },
      include: {
        company: { select: { id: true, name: true, slug: true } },
        _count: { select: { redemptions: true } },
      },
    });

    if (!employee) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Employee not found" },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: employee });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================
// 1. PROPER TYPE DEFINITIONS
// ============================================

// Define the user type properly
interface User {
  id: string;
  email: string;
  userType: 'admin' | 'company_admin' | 'employee' | 'merchant';
  role: string;
  profileId: string | null;
  companyId: string | null;
  profileType: string;       
  profile: any;              
}

// ============================================
// 2. VALIDATION FUNCTIONS WITH PROPER TYPES
// ============================================

interface ValidationResult<T = any> {
  valid: boolean;
  error?: {
    success: false;
    error: {
      code: string;
      message: string;
      details?: any;
    };
  };
  status?: number;
  employee?: any;
}

/**
 * Validate user authorization with proper null handling
 */
async function validateAuthorization(
  user: User | null,
): Promise<ValidationResult> {
  console.log("[PATCH] Validating authorization...");

  // ✅ Check if user is null first
  if (!user) {
    console.log("[PATCH] ❌ No user found");
    return {
      valid: false,
      error: {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        },
      },
      status: 401,
    };
  }

  // ✅ Now TypeScript knows user is not null
  if (!["admin", "company_admin"].includes(user.userType)) {
    console.log(
      "[PATCH] ❌ Unauthorized - user type not allowed:",
      user.userType,
    );
    return {
      valid: false,
      error: {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Insufficient permissions",
        },
      },
      status: 403,
    };
  }

  console.log("[PATCH] ✅ User authorized:", user.email);
  return { valid: true };
}

/**
 * Validate employee exists
 */
async function validateEmployeeExists(
  id: string,
  companyId?: string,
): Promise<ValidationResult> {
  console.log("[PATCH] Validating employee existence...");

  const where = {
    id,
    deletedAt: null,
    ...(companyId ? { companyId } : {}),
  };

  const employee = await prisma.employee.findFirst({
    where,
    include: {
      account: {
        select: { authUserId: true, email: true, status: true },
      },
    },
  });

  if (!employee) {
    console.log("[PATCH] ❌ Employee not found for id:", id);
    return {
      valid: false,
      error: {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Employee not found",
        },
      },
      status: 404,
      employee: null,
    };
  }

  console.log("[PATCH] ✅ Employee found:", {
    id: employee.id,
    email: employee.account?.email,
    firstName: employee.firstName,
    lastName: employee.lastName,
  });

  return {
    valid: true,
    employee,
  };
}

/**
 * Validate email uniqueness
 */
async function validateEmailUniqueness(
  email: string,
  currentAccountId: string | null,
): Promise<ValidationResult> {
  console.log("[PATCH] Validating email uniqueness for:", email);

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.log("[PATCH] ❌ Invalid email format:", email);
    return {
      valid: false,
      error: {
        success: false,
        error: {
          code: "VALIDATION",
          message: "Invalid email format",
        },
      },
      status: 400,
    };
  }

  // Check if email already exists (using your validation function)
  const validation = await validateUserEmail(email);
  console.log(
    "[PATCH] Email validation result:",
    JSON.stringify(validation, null, 2),
  );

  if (validation.exists && validation.userId !== currentAccountId) {
    console.log("[PATCH] ❌ Email already registered to another user");
    return {
      valid: false,
      error: {
        success: false,
        error: {
          code: "VALIDATION",
          message: `Email "${email}" is already registered`,
        },
      },
      status: 400,
    };
  }

  console.log("[PATCH] ✅ Email is unique and available");
  return { valid: true };
}

// ============================================
// 3. EMAIL CHANGE FUNCTIONS
// ============================================

/**
 * Detect email change
 */
function detectEmailChange(body: any, currentEmail: string | null) {
  console.log("[PATCH] Detecting email change...");

  // Check if email is present in body
  if (body.email === undefined || body.email === null) {
    console.log("[PATCH] No email provided in request body");
    return {
      emailChanged: false,
      nextEmail: currentEmail,
      emailProvided: false,
      error: null,
    };
  }

  const nextEmail = body.email?.trim();
  console.log("[PATCH] Email provided:", nextEmail);

  if (!nextEmail) {
    console.log("[PATCH] ❌ Email is empty");
    return {
      emailChanged: false,
      nextEmail: null,
      emailProvided: true,
      error: {
        valid: false,
        error: {
          success: false,
          error: {
            code: "VALIDATION",
            message: "Email cannot be empty",
          },
        },
        status: 400,
      },
    };
  }

  const emailChanged =
    currentEmail !== null &&
    nextEmail.toLowerCase() !== currentEmail.toLowerCase();

  console.log("[PATCH] Email details:", {
    currentEmail,
    nextEmail,
    emailChanged,
  });

  return {
    emailChanged,
    nextEmail,
    emailProvided: true,
    error: null,
  };
}

/**
 * Update employee email
 */
async function updateEmployeeEmail(
  id: string,
  existingEmployee: any,
  nextEmail: string,
  user: User, // ✅ User is guaranteed non-null here
  company: any,
) {
  console.log("[PATCH] Updating employee email...");
  console.log("[PATCH] Account ID:", existingEmployee.account?.authUserId);

  if (!existingEmployee.account?.authUserId) {
    throw new Error("Employee has no associated account");
  }

  // Execute update in transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Update account email
    console.log("[PATCH] Transaction: Updating account email...");
    const accountResult = await tx.account.update({
      where: { authUserId: existingEmployee.account.authUserId },
      data: { email: nextEmail },
    });
    console.log("[PATCH] ✅ Account email updated:", {
      authUserId: accountResult.authUserId,
      email: accountResult.email,
    });

    // 2. Get updated employee with account info
    const updatedEmployee = await tx.employee.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, slug: true } },
        account: { select: { email: true, status: true } },
      },
    });

    return updatedEmployee;
  });

  console.log("[PATCH] ✅ Transaction completed successfully");
  return result;
}

/**
 * Create audit log for email change
 */
async function createEmailAuditLog(
  user: User, // ✅ User is guaranteed non-null here
  id: string,
  currentEmail: string | null,
  nextEmail: string,
) {
  console.log("[PATCH] Creating audit log for email change...");

  try {
    await createAuditLog(
      fromCurrentUser(user, "EMPLOYEE_EMAIL_UPDATED", "employee", id, {
        metadata: {
          action: "EMAIL_CHANGED",
          oldEmail: currentEmail,
          newEmail: nextEmail,
          changedBy: user.id,
          changedByEmail: user.email,
        },
      }),
    );
    console.log("[PATCH] ✅ Audit log created");
  } catch (auditError) {
    console.log("[PATCH] ⚠️ Audit log creation failed:", auditError);
    // Don't fail the request if audit log fails
  }
}

/**
 * Send email change notification
 */
async function sendEmailChangeNotification(
  nextEmail: string,
  companyName: string,
  employeeName: string,
) {
  console.log("[PATCH] Sending email notification for email change...");

  try {
    await emailService.sendEmail({
      to: nextEmail,
      subject: `Your email has been updated for ${companyName}`,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>Email Address Updated</h2>
                <p>Hi ${employeeName},</p>
                <p>Your email address for ${companyName} has been changed to:</p>
                <p><strong>${nextEmail}</strong></p>
                <p>If you did not request this change, please contact your company administrator immediately.</p>
                <br />
                <p>Best Regards,<br />${companyName} Team</p>
              </div>`,
    });
    console.log("[PATCH] ✅ Email notification sent to:", nextEmail);
  } catch (emailError) {
    console.log("[PATCH] ⚠️ Email notification failed:", emailError);
    // Don't fail the request if email fails
  }
}

/**
 * Send notification to old email about the change
 */
async function sendOldEmailNotification(
  oldEmail: string,
  companyName: string,
  employeeName: string,
) {
  console.log("[PATCH] Sending notification to old email...");

  try {
    await emailService.sendEmail({
      to: oldEmail,
      subject: `Your email was changed for ${companyName}`,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>Email Address Changed</h2>
                <p>Hi ${employeeName},</p>
                <p>Your email address for ${companyName} has been changed.</p>
                <p>If you did not request this change, please contact your company administrator immediately.</p>
                <br />
                <p>Best Regards,<br />${companyName} Team</p>
              </div>`,
    });
    console.log("[PATCH] ✅ Notification sent to old email:", oldEmail);
  } catch (emailError) {
    console.log("[PATCH] ⚠️ Old email notification failed:", emailError);
    // Don't fail the request if email fails
  }
}

// ============================================
// 4. CONTEXT FUNCTIONS WITH PROPER TYPES
// ============================================

/**
 * Get company context for company_admin
 */
async function getCompanyContext(user: User | null) {
  console.log("[PATCH] Getting company context...");

  // ✅ Check if user is null
  if (!user) {
    console.log("[PATCH] No user provided");
    return { company: null };
  }

  if (user.userType === "company_admin") {
    console.log("[PATCH] Getting company context for company_admin...");
    const companyContext = await getCompanyAdmin();
    console.log("[PATCH] Company context:", {
      companyId: companyContext.company?.id,
      companyName: companyContext.company?.name,
    });
    return companyContext;
  }

  return { company: null };
}

// ============================================
// 5. MAIN PATCH FUNCTION
// ============================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  console.log("[PATCH /api/company/employees/[id]/email] === START ===");
  console.log("[PATCH] Request timestamp:", new Date().toISOString());

  try {
    // Step 1: Get user (might be null)
    console.log("[PATCH] Getting current user...");
    const user: User | null = await getCurrentUser(); // ✅ Proper type with | null
    console.log("[PATCH] Current user:", user?.email || "No user found");

    // Step 2: Validate authorization
    const authValidation = await validateAuthorization(user);
    if (!authValidation.valid) {
      return NextResponse.json(authValidation.error, {
        status: authValidation.status || 401,
      });
    }

    // ✅ Now TypeScript knows user is not null (because validation passed)
    // But we still need to handle the case where user might be null
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        },
        { status: 401 },
      );
    }

    // Step 3: Extract params and body
    console.log("[PATCH] Extracting params...");
    const { id } = await params;
    console.log("[PATCH] Employee ID from params:", id);

    console.log("[PATCH] Parsing request body...");
    const body = await request.json();
    console.log("[PATCH] Request body:", JSON.stringify(body, null, 2));

    // Step 4: Get company context
    const { company } = await getCompanyContext(user);

    // Step 5: Validate employee exists
    const employeeValidation = await validateEmployeeExists(id, company?.id);

    // ✅ Check if validation failed OR employee is null
    if (!employeeValidation.valid || !employeeValidation.employee) {
      return NextResponse.json(
        employeeValidation.error || {
          success: false,
          error: { code: "NOT_FOUND", message: "Employee not found" },
        },
        { status: employeeValidation.status || 404 },
      );
    }

    // ✅ Now TypeScript knows employee exists
    const existingEmployee = employeeValidation.employee;

    // Step 6: Handle profile field updates (firstName, lastName, etc. + avatarUrl)
    const profileUpdate: Record<string, unknown> = {};
    const changedFields: string[] = [];

    if (body.firstName !== undefined && body.firstName !== existingEmployee.firstName) {
      if (!String(body.firstName).trim()) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION", message: "First name cannot be empty" } },
          { status: 400 },
        );
      }
      profileUpdate.firstName = String(body.firstName).trim();
      changedFields.push("firstName");
    }
    if (body.lastName !== undefined && body.lastName !== existingEmployee.lastName) {
      if (!String(body.lastName).trim()) {
        return NextResponse.json(
          { success: false, error: { code: "VALIDATION", message: "Last name cannot be empty" } },
          { status: 400 },
        );
      }
      profileUpdate.lastName = String(body.lastName).trim();
      changedFields.push("lastName");
    }
    if (body.employeeId !== undefined) {
      const next = body.employeeId?.trim() || null;
      if (next !== existingEmployee.employeeId) {
        if (next) {
          const dupe = await prisma.employee.findFirst({
            where: { companyId: existingEmployee.companyId, employeeId: next, id: { not: id }, deletedAt: null },
          });
          if (dupe) {
            return NextResponse.json(
              { success: false, error: { code: "VALIDATION", message: `Employee ID "${next}" already exists in this company` } },
              { status: 400 },
            );
          }
        }
        profileUpdate.employeeId = next;
        changedFields.push("employeeId");
      }
    }
    if (body.department !== undefined) {
      const next = body.department?.trim() || null;
      if (next !== existingEmployee.department) {
        profileUpdate.department = next;
        changedFields.push("department");
      }
    }
    if (body.jobTitle !== undefined) {
      const next = body.jobTitle?.trim() || null;
      if (next !== existingEmployee.jobTitle) {
        profileUpdate.jobTitle = next;
        changedFields.push("jobTitle");
      }
    }
    if (body.phone !== undefined) {
      const next = body.phone?.trim() || null;
      if (next !== existingEmployee.phone) {
        profileUpdate.phone = next;
        changedFields.push("phone");
      }
    }
    if (body.avatarUrl !== undefined && body.avatarUrl !== existingEmployee.avatarUrl) {
      profileUpdate.avatarUrl = body.avatarUrl;
      changedFields.push("avatarUrl");
      if (existingEmployee.avatarUrl) {
        void deleteImage(existingEmployee.avatarUrl, { bucket: "offer-images" }).catch(() => {});
      }
    }

    if (Object.keys(profileUpdate).length > 0) {
      await prisma.employee.update({ where: { id }, data: profileUpdate as any });
      try {
        await createAuditLog(
          fromCurrentUser(user, "EMPLOYEE_UPDATED", "employee", id, { changes: { changedFields } }),
        );
      } catch (auditError) {
        console.log("[PATCH] ⚠️ Profile audit log creation failed:", auditError);
      }
    }

    // Step 7: Check if email is provided and detect change
    const currentEmail = existingEmployee.account?.email ?? null;
    const emailCheck = detectEmailChange(body, currentEmail);

    if (emailCheck.error) {
      return NextResponse.json(emailCheck.error.error, {
        status: emailCheck.error.status || 400,
      });
    }

    // No email change — return updated employee if profile was changed, else "no changes"
    if (!emailCheck.emailProvided || !emailCheck.emailChanged) {
      if (changedFields.length === 0) {
        return NextResponse.json({
          success: true,
          message: "No changes",
          data: existingEmployee,
        });
      }
      const updated = await prisma.employee.findUnique({
        where: { id },
        include: {
          company: { select: { id: true, name: true, slug: true } },
          account: { select: { email: true, status: true } },
        },
      });
      return NextResponse.json({
        success: true,
        data: updated,
        message: "Employee updated successfully",
      });
    }

    // Step 8: Validate email uniqueness
    const nextEmail = emailCheck.nextEmail!;
    const emailValidation = await validateEmailUniqueness(
      nextEmail,
      existingEmployee.account?.authUserId ?? null,
    );

    if (!emailValidation.valid) {
      return NextResponse.json(emailValidation.error, {
        status: emailValidation.status || 400,
      });
    }

    // Step 9: Update email in account table
    const result = await updateEmployeeEmail(
      id,
      existingEmployee,
      nextEmail,
      user,
      company,
    );

    // Step 10: Create audit log for email change
    await createEmailAuditLog(user, id, currentEmail, nextEmail);

    // Step 11: Send email notifications
    const companyName = result?.company?.name ?? company?.name ?? "your company";
    const employeeName = existingEmployee.firstName ?? "Employee";

    await sendEmailChangeNotification(nextEmail, companyName, employeeName);
    if (currentEmail) {
      await sendOldEmailNotification(currentEmail, companyName, employeeName);
    }

    console.log("[PATCH] ✅ Update completed successfully");
    return NextResponse.json({
      success: true,
      data: result,
      message: changedFields.length > 0
        ? `Employee updated and email changed from ${currentEmail} to ${nextEmail}`
        : `Employee email successfully changed from ${currentEmail} to ${nextEmail}`,
    });
  } catch (error) {
    console.log("[PATCH] ❌ Unhandled error:", error);
    console.log(
      "[PATCH] Error stack:",
      error instanceof Error ? error.stack : "No stack trace",
    );
    return handleApiError(error);
  }
}
