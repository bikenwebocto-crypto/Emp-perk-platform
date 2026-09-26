import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'

export async function GET() {
  const requestStart = performance.now()

  try {
    console.time('[auth/me] total')

    // -------------------------
    // Authentication
    // -------------------------
    console.time('[auth/me] getCurrentUser')

    const authStart = performance.now()
    const user = await getCurrentUser()
    const authEnd = performance.now()

    console.timeEnd('[auth/me] getCurrentUser')
    console.log(
      `[auth/me] getCurrentUser took ${(authEnd - authStart).toFixed(2)} ms`
    )

    if (!user) {
      console.timeEnd('[auth/me] total')
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // -------------------------
    // Build response
    // -------------------------
    console.time('[auth/me] buildResponse')

    const profile = user.profile as Record<string, unknown> | null

    const avatarUrl =
      user.userType === 'merchant'
        ? (profile?.logoUrl as string) ?? null
        : (profile?.avatarUrl as string) ?? null

    let name = user.email

    if (profile) {
      const firstName = profile.firstName as string | undefined
      const lastName = profile.lastName as string | undefined
      const businessName = profile.businessName as string | undefined

      if (user.userType === 'merchant' && businessName) {
        name = businessName
      } else if (firstName) {
        name = `${firstName} ${lastName ?? ''}`.trim()
      }
    }

    console.timeEnd('[auth/me] buildResponse')

    const response = NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name,
        userType: user.userType,
        role: user.role,
        companyName: user.companyName,
        companyId: user.companyId ?? null,
        avatarUrl,
      },
    })

    console.timeEnd('[auth/me] total')

    console.log(
      `[auth/me] COMPLETE ${(performance.now() - requestStart).toFixed(2)} ms`
    )

    return response
  } catch (error) {
    console.timeEnd('[auth/me] total')
    console.error('[auth/me]', error)

    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }
}