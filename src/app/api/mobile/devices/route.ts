import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { activateDeviceToken } from '@/lib/device-token.service'
import { createAuditLog } from '@/services/audit-log.service'
import { internalError } from '@/lib/employee-helpers'

// POST /api/mobile/devices
//
// Registers (or re-activates) this device's FCM push token for the
// authenticated employee. The app calls this after login and whenever
// the token refreshes. The token is upserted by its unique value and
// marked enabled=true so the push service delivers to it.
//
// Body:
//   - fcmToken: required — FCM registration token
//   - deviceId: optional — identifier of the mobile device
//
// The userId is always derived from the authenticated token, never from
// the body, so a caller cannot register a token against someone else's
// account.
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

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
      // Body required below.
    }

    if (!fcmToken) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FCM_TOKEN_REQUIRED', message: 'fcmToken is required' },
        },
        { status: 400 },
      )
    }

    await activateDeviceToken({
      userId: auth.account.authUserId,
      token: fcmToken,
      deviceId,
    })

    await createAuditLog({
      actorType: 'employee',
      actorId: auth.employee.id,
      action: 'DEVICE_TOKEN_REGISTERED',
      entityType: 'employee',
      entityId: auth.employee.id,
      metadata: {
        employeeId: auth.employee.id,
        deviceId,
        hasFcmToken: true,
        loginSource: 'mobile',
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return internalError(error)
  }
}
