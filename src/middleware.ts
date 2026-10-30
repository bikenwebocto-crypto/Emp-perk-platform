import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { canAdminAccessPath, canAdminCallApi, adminLandingPath } from "@/lib/access/account-access";
import { hasVerifiedTotpFactor, requiresMfaForRole } from "@/lib/auth/mfa";

const ROLE_DASHBOARD_MAP: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  COMPANY_ADMIN: "/company",
  MERCHANT: "/merchant",
  EMPLOYEE: "/employee",
};

const ROLE_ACCESS_MAP: Record<string, string[]> = {
  SUPER_ADMIN: ["/admin"],
  COMPANY_ADMIN: ["/company"],
  MERCHANT: ["/merchant"],
  EMPLOYEE: ["/employee"],
};

interface RoleInfo {
  role: string;
  /** AdminUser.role for admin accounts (decides which /admin pages open). */
  adminRole: string | null;
}

// Per-instance cache of the account role. Middleware runs on the Edge runtime,
// in a different isolate from the Node API routes that change roles (e.g.
// promoteEmployeeToCompanyAdmin), so those routes cannot invalidate this map.
// Keep the TTL short so a role change is picked up within 30s; the dashboard
// shell also redirects on the client from the live /api/auth/me user.
const roleCache = new Map<string, RoleInfo & { timestamp: number }>();
const CACHE_TTL = 30 * 1000;

const PUBLIC_API_ROUTES = [
  "/api/auth/sync-admin",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/firebase-config",
  "/api/webhooks",
  "/api/health",
  "/api/categories",
  "/api/leads",
  "/api/demo-bookings", // public "Book a Demo" form + availability; /api/admin/demo-bookings stays protected
  "/api/cron", // protected by CRON_SECRET inside each route
];

async function fetchRole(
  supabase: ReturnType<typeof createServerClient>,
  email: string,
  request: NextRequest,
): Promise<RoleInfo | null> {
  const cached = roleCache.get(email);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { role: cached.role, adminRole: cached.adminRole };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return null

    const res = await fetch(new URL("/api/auth/session", request.url), {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "x-middleware-email": email,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })
    if (!res.ok) return null

    const data = await res.json()
    const role: string | undefined = data.user?.role
    const adminRole: string | null = data.user?.adminRole ?? null
    if (role) {
      roleCache.set(email, { role, adminRole, timestamp: Date.now() })
    }
    return role ? { role, adminRole } : null
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  if (pathname === "/login" || pathname === "/auth/callback") {
    return NextResponse.next()
  }

  const isProtected = ["/admin", "/merchant", "/company", "/employee"].some((p) =>
    pathname.startsWith(p),
  )
  const isApiRoute = pathname.startsWith("/api")

  if (!isProtected && !isApiRoute) {
    return NextResponse.next()
  }

  const isPublicApi = isApiRoute && PUBLIC_API_ROUTES.some((p) => pathname.startsWith(p))
  if (isPublicApi) {
    return NextResponse.next()
  }

  const requestHeaders = new Headers(request.headers)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value!, options ?? {})
          })
        },
      },
    },
  )

  // Bearer-token auth (mobile API clients) takes priority over cookies.
  const authHeader = request.headers.get("Authorization")
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null

  const { data: { user } } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser()
  if (!user) {
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirectTo", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // For API routes: just set auth headers and pass through. SUPPORT_ADMIN is
  // restricted to the tickets UI, so every /api/admin/* route it does not
  // explicitly need (notifications, sidebar counts) is rejected here. Ticket
  // APIs live under /api/complaints/admin and are gated in-route.
  if (isApiRoute) {
    const isPrivilegedApiRoute =
      pathname.startsWith("/api/admin/") ||
      pathname.startsWith("/api/company/") ||
      pathname.startsWith("/api/merchant/")

    if (isPrivilegedApiRoute) {
      const roleInfo = await fetchRole(supabase, user.email!, request)
      if (pathname.startsWith("/api/admin/") && !canAdminCallApi(roleInfo?.adminRole, pathname)) {
        return NextResponse.json(
          { success: false, error: { code: "FORBIDDEN", message: "Forbidden" } },
          { status: 403 },
        )
      }

      const { data: factors } = await supabase.auth.mfa.listFactors()
      const hasTotp = hasVerifiedTotpFactor(factors)
      const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (!hasTotp || assurance?.currentLevel !== "aal2") {
        return NextResponse.json(
          { success: false, error: { code: "MFA_REQUIRED", message: "MFA verification required." } },
          { status: 403 },
        )
      }
    }
    requestHeaders.set("x-auth-email", user.email!)
    response.headers.set("x-auth-email", user.email!)
    return response
  }

  // For page routes: full role-based access check
  const roleInfo = await fetchRole(supabase, user.email!, request)
  const role = roleInfo?.role

  if (!role) {
    await supabase.auth.signOut()
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("error", "Your account role is not configured.")
    return NextResponse.redirect(loginUrl)
  }

  if (requiresMfaForRole(role)) {
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const hasTotp = hasVerifiedTotpFactor(factors)
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (!hasTotp) {
      return NextResponse.redirect(new URL("/mfa/setup", request.url))
    }

    if (assurance?.currentLevel !== "aal2") {
      return NextResponse.redirect(new URL("/mfa/verify", request.url))
    }
  }

  const allowedPaths = ROLE_ACCESS_MAP[role] ?? ["/employee"]
  const hasAccess = allowedPaths.some((path) => pathname.startsWith(path))
  if (!hasAccess) {
    return NextResponse.redirect(
      new URL(ROLE_DASHBOARD_MAP[role] ?? "/employee", request.url),
    )
  }

  // Admin permission level: each admin role only opens its own /admin pages.
  // SUPPORT_ADMIN has no overview, so it is sent to its tickets list instead.
  if (role === "SUPER_ADMIN" && !canAdminAccessPath(roleInfo?.adminRole, pathname)) {
    return NextResponse.redirect(new URL(adminLandingPath(roleInfo?.adminRole), request.url))
  }

  requestHeaders.set("x-auth-role", role)
  requestHeaders.set("x-auth-email", user.email!)

  response.headers.set("x-auth-role", role)
  response.headers.set("x-auth-email", user.email!)
  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
