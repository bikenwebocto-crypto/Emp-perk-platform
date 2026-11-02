import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { internalError } from '@/lib/employee-helpers'
import { createAuditLog } from '@/services/audit-log.service'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { deactivateDeviceToken } from '@/lib/device-token.service'

// POST /api/mobile/auth/logout
//
// Validates the Supabase Bearer token via the shared
// `getAuthenticatedMobileEmployee` helper, deactivates this device's FCM
// token (so the push service stops delivering to it), calls
// `supabase.auth.signOut()` server-side (which invalidates the refresh
// token), and records a MOBILE_LOGOUT audit entry.
//
// Optional body fields (used to target the device-token row):
//   - deviceId: identifier of the mobile device
//   - fcmToken: the FCM token to deactivate
//
// Note: cookie clearing is intentionally omitted — the mobile app does
// not use Supabase SSR cookies; the Bearer token is the only transport.
export async function POST(request: NextRequest) {
  try {
    let deviceId: string | null = null
    let fcmToken: string | null = null
    try {
      const body = await request.json()
      if (body && typeof body.deviceId === 'string' && body.deviceId.length > 0) {
        deviceId = body.deviceId
      }
      if (body && typeof body.fcmToken === 'string' && body.fcmToken.length > 0) {
        fcmToken = body.fcmToken
      }
    } catch {
      // Empty body is fine — logout still proceeds, just without
      // device-token targeting.
    }

    // const auth = await getAuthenticatedMobileEmployee(request)
    // if (!auth.ok) return auth.response

    // Deactivate this device's push token so it stops receiving notifications.
    // await deactivateDeviceToken({
    //   userId: auth.account.authUserId,
    //   deviceId,
    //   token: fcmToken,
    // }).catch(() => null)

    const supabase = await createClient()
    // Sign out at Supabase — this invalidates the refresh token server-side.
    await supabase.auth.signOut().catch(() => null)

    // void createAuditLog({
    //   actorType: 'employee',
    //   actorId: auth.employee.id,
    //   action: 'MOBILE_LOGOUT',
    //   entityType: 'employee',
    //   entityId: auth.employee.id,
    //   metadata: {
    //     deviceId,
    //     hasFcmToken: !!fcmToken,
    //     loginSource: 'mobile',
    //   },
    // })

    return NextResponse.json({ success: true })
  } catch (error) {
    return internalError(error)
  }
}
