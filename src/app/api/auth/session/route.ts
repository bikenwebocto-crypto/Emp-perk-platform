import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const middlewareEmail = request.headers.get('x-middleware-email')

    let id: string
    let email: string

    if (middlewareEmail) {
      email = middlewareEmail
      const account = await prisma.account.findUnique({
        where: { email },
        select: { authUserId: true },
      })
      if (!account) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      }
      id = account.authUserId
    } else {
      const authHeader = request.headers.get('Authorization')
      let token = null
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7)
      }

      let supabase
      if (token) {
        supabase = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          {
            cookies: { getAll() { return [] }, setAll() {} },
            global: { headers: { Authorization: `Bearer ${token}` } },
          }
        )
      } else {
        const cookieStore = await cookies()
        supabase = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          {
            cookies: { getAll() { return cookieStore.getAll() }, setAll() {} },
          }
        )
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      }
      id = user.id
      email = user.email!
    }

    let role = null
    let profileType = null
    let adminRole: string | null = null
    try {
      const account = await prisma.account.findUnique({
        where: { email },
        select: { role: true, profileType: true, authUserId: true },
      })
      role = account?.role ?? null
      profileType = account?.profileType ?? null
      // Admin permission level (sidebar + /admin page access).
      if (account?.profileType === 'ADMIN') {
        const admin = await prisma.adminUser.findFirst({
          where: { accountId: account.authUserId },
          select: { role: true, isActive: true },
        })
        adminRole = admin?.isActive === false ? null : (admin?.role ?? null)
        if (admin?.isActive === false) role = null // disabled admin: no access
      }
    } catch (error) {
      console.error('Error fetching role:', error)
    }

    return NextResponse.json({
      authenticated: true,
      user: { id, email, role, profileType, adminRole },
    })
  } catch (error) {
    console.error('Session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}