import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { forbidden } from "@/lib/api-auth";
import { createCompanyAdmin, type AddAdminBody } from "@/lib/company-detail/service";

/**
 * POST /api/admin/companies/[id]/admins
 * Create a new company admin. Auto-assigns primary if the company has
 * no active primary yet.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 },
    );
  }
  if (user.userType !== "admin") return forbidden(user.userType);

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as AddAdminBody;
  return createCompanyAdmin(user, id, body);
}
