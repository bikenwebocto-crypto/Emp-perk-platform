import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { forbidden } from '@/lib/api-auth'
import { sendLaunchPack } from '@/lib/company-activation/launch-pack'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}
function internalError(error: unknown) {
  console.error('Launch pack error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (user.userType !== 'admin') return forbidden(user.userType)

    const { id } = await params
    if (!user.profileId) return forbidden(user.userType)
    const result = await sendLaunchPack(id, user.profileId)
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return internalError(error)
  }
}
