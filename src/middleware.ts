import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

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

const roleCache = new Map<string, { role: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

const PUBLIC_API_ROUTES = [
  "/api/auth/sync-admin",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/firebase-config",
  "/api/webhooks",
  "/api/health",
];

async function fetchRole(
  supabase: ReturnType<typeof createServerClient>,
  email: string,
  request: NextRequest,
): Promise<string | null> {
  const cached = roleCache.get(email);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.role;
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
    if (role) {
      roleCache.set(email, { role, timestamp: Date.now() })
    }
    return role ?? null
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

  // For API routes: just set auth headers and pass through (no role check)
  if (isApiRoute) {
    requestHeaders.set("x-auth-email", user.email!)
    response.headers.set("x-auth-email", user.email!)
    return response
  }

  // For page routes: full role-based access check
  const role = await fetchRole(supabase, user.email!, request)

  if (!role) {
    await supabase.auth.signOut()
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("error", "Your account role is not configured.")
    return NextResponse.redirect(loginUrl)
  }

  const allowedPaths = ROLE_ACCESS_MAP[role] ?? ["/employee"]
  const hasAccess = allowedPaths.some((path) => pathname.startsWith(path))
  if (!hasAccess) {
    return NextResponse.redirect(
      new URL(ROLE_DASHBOARD_MAP[role] ?? "/employee", request.url),
    )
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
