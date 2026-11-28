import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service'
import { getAdminBranding, upsertBranding } from '@/features/admin/settings/login-branding/services/login-branding.service'
import { validateLoginBranding } from '@/features/admin/settings/login-branding/schemas/login-branding.schema'
import { deleteImage } from '@/lib/upload/image'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const branding = await getAdminBranding()
    return NextResponse.json({ success: true, data: branding })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to load branding configuration' },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (!user.profileId) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_ADMIN_PROFILE', message: 'Admin profile not found' } },
        { status: 403 },
      )
    }

    const body = await request.json()

    const validationError = validateLoginBranding(body)
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 },
      )
    }

    // Fetch existing branding to compare URLs for cleanup
    const existing = await getAdminBranding()
    const oldUrls = {
      logoUrl: existing?.logoUrl ?? null,
      bannerUrl: existing?.bannerUrl ?? null,
      backgroundImageUrl: existing?.backgroundImageUrl ?? null,
    }

    const branding = await prisma.$transaction(async (tx) => {
      const result = await upsertBranding(body, tx)
      await createAuditLog(
        fromCurrentUser(user, 'LOGIN_BRANDING_UPDATED', 'LoginBranding', result.id, {
          changes: Object.keys(body),
        }),
        tx,
      )
      return result
    })

    // Clean up old images after successful transaction (replacement only)
    const newUrls = branding as any
    if (body.logoUrl !== undefined && oldUrls.logoUrl && newUrls.logoUrl !== oldUrls.logoUrl) {
      deleteImage(oldUrls.logoUrl, { bucket: 'offer-images' }).catch(() => {})
    }
    if (body.bannerUrl !== undefined && oldUrls.bannerUrl && newUrls.bannerUrl !== oldUrls.bannerUrl) {
      deleteImage(oldUrls.bannerUrl, { bucket: 'offer-images' }).catch(() => {})
    }
    if (body.backgroundImageUrl !== undefined && oldUrls.backgroundImageUrl && newUrls.backgroundImageUrl !== oldUrls.backgroundImageUrl) {
      deleteImage(oldUrls.backgroundImageUrl, { bucket: 'offer-images' }).catch(() => {})
    }

    return NextResponse.json({ success: true, data: branding })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to update branding configuration' },
      { status: 500 },
    )
  }
}
