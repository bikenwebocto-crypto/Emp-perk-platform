import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import {
  BLOCKED_ADMIN_PATHS,
  canAdminAccessPath,
  canAdminCallApi,
  adminLandingPath,
} from "@/lib/access/account-access";
import { hasVerifiedTotpFactor, requiresMfaForRole } from "@/lib/auth/mfa";
import { getAppUrl } from "@/lib/app-url";

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

// User-facing redirects must use the public origin. In the standalone server
// request.url carries the container's own host (ip-…ec2.internal on ECS).
// Missing env falls back to the request origin rather than failing every page.
function publicOrigin(request: NextRequest): string {
  try {
    return getAppUrl()
  } catch (err) {
    console.error("[middleware] NEXT_PUBLIC_APP_URL missing; using request origin", err)
    return request.nextUrl.origin
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const publicUrl = (path: string) => new URL(path, publicOrigin(request))

  // Only redirect when a proxy explicitly reports http. The NLB sends no
  // x-forwarded-proto, so there this is a no-op: http→https belongs at the
  // load balancer (TLS listener / port-80 redirect).
  if (
    process.env.NODE_ENV === "production" &&
    request.headers.get("x-forwarded-proto") === "http"
  ) {
    return NextResponse.redirect(publicUrl(pathname + request.nextUrl.search), 308)
  }

  if (pathname === "/") {
    return NextResponse.redirect(publicUrl("/login"))
  }
  if (pathname === "/login" || pathname === "/auth/callback") {
    return NextResponse.next()
  }

  const isProtected = ["/admin", "/merchant", "/company", "/employee"].some((p) =>
    pathname.startsWith(p),
  )
  const isApiRoute = pathname.startsWith("/api")

  // Paid banners are hidden for merchants in V1: no page, no API.
  if (pathname.startsWith("/api/merchant/banners")) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 },
    )
  }
  if (pathname.startsWith("/merchant/banners")) {
    return NextResponse.redirect(publicUrl("/merchant"))
  }

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
    const loginUrl = publicUrl("/login")
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

      if (requiresMfaForRole(roleInfo?.role)) {
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
    const loginUrl = publicUrl("/login")
    loginUrl.searchParams.set("error", "Your account role is not configured.")
    return NextResponse.redirect(loginUrl)
  }

  if (requiresMfaForRole(role)) {
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const hasTotp = hasVerifiedTotpFactor(factors)
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (!hasTotp) {
      return NextResponse.redirect(publicUrl("/mfa/setup"))
    }

    if (assurance?.currentLevel !== "aal2") {
      return NextResponse.redirect(publicUrl("/mfa/verify"))
    }
  }

  const allowedPaths = ROLE_ACCESS_MAP[role] ?? ["/employee"]
  const hasAccess = allowedPaths.some((path) => pathname.startsWith(path))
  if (!hasAccess) {
    return NextResponse.redirect(
      publicUrl(ROLE_DASHBOARD_MAP[role] ?? "/employee"),
    )
  }

  // Admin permission level: each admin role only opens its own /admin pages.
  // SUPPORT_ADMIN has no overview, so it is sent to its tickets list instead.
  if (
    pathname.startsWith("/admin") &&
    (
      BLOCKED_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
      (role === "SUPER_ADMIN" && !canAdminAccessPath(roleInfo?.adminRole, pathname))
    )
  ) {
    return NextResponse.redirect(publicUrl(adminLandingPath(roleInfo?.adminRole)))
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
