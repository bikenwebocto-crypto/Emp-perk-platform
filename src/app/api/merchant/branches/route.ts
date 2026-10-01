import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'
import {
  validateBranchInput,
  hasDuplicateAddress,
  isSignificantLocationChange,
  DEFAULT_OPENING_HOURS,
} from '@/lib/branch-helpers'
import { createAuditLog } from '@/services/audit-log.service'
import { channels, publishBusinessNotification } from '@/services/business-notification.service'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}
function badRequest(message: string, details?: Record<string, string>) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION', message, details } },
    { status: 400 }
  )
}
function internalError(error: unknown) {
  console.error('Merchant branches API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

export async function GET(request: NextRequest) {
  try {
    const merchant = await getMerchantFromSession()

    if (!merchant) {
      return unauthorized()
    }

    const { searchParams } = new URL(request.url)

    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const q = searchParams.get('q')
    const includeClosed = searchParams.get('includeClosed') === 'true'

    const where: Prisma.MerchantBranchWhereInput = {
      merchantId: merchant.id,
      deletedAt: null,
    }

    if (status === 'active') {
      where.isActive = true
    }

    if (status === 'inactive') {
      where.isActive = false
    }

    if (type && type !== 'ALL') {
      where.branchType = type as 'IN_STORE' | 'ONLINE'
    }

    if (!includeClosed) {
      where.status = { not: 'CLOSED' }
    }

    if (q) {
      where.OR = [
        {
          name: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          city: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          state: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          addressLine1: {
            contains: q,
            mode: 'insensitive',
          },
        },
      ]
    }

    const branches = await prisma.merchantBranch.findMany({
      where,
      select: {
        id: true,
        name: true,
        branchType: true,
        isNationwide: true,
        deliveryRadiusKm: true,
        city: true,
        state: true,
        country: true,
        isPrimary: true,
        isActive: true,
        status: true,
        createdAt: true,
      },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json({
      success: true,
      data: branches,
    })
  } catch (error) {
    return internalError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
     const merchant = await getMerchantFromSession()
    if (!merchant) {
      return unauthorized()
    }
    const body = await request.json()
    const {
      name,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      phone,
      email,
      latitude,
      longitude,
      openingHours,
      isPrimary,
      branchType,
      deliveryRadiusKm,
      isNationwide,
      storefrontImageUrl,
      branchImages,
      parkingInfo,
      wheelchairAccess,
      landmark,
      description,
    } = body

    const validation = validateBranchInput({
      name,
      addressLine1,
      city,
      country,
      latitude,
      longitude,
      branchType,
      isNationwide,
      deliveryRadiusKm,
    })
    if (!validation.valid) return badRequest('Validation failed', validation.errors)

    if (branchType === 'ONLINE') {
      const existingOnline = await prisma.merchantBranch.findFirst({
        where: { merchantId: merchant.id, branchType: 'ONLINE', deletedAt: null },
      })
      if (existingOnline) {
        return badRequest('Maximum one ONLINE branch allowed per merchant', {
          branchType: 'You already have an ONLINE branch. Edit it instead of creating another.',
        })
      }
    }

    if (branchType === 'IN_STORE') {
      const existingAddresses = await prisma.merchantBranch.findMany({
        where: { merchantId: merchant.id, deletedAt: null, branchType: 'IN_STORE' },
        select: { id: true, addressLine1: true, city: true, state: true, postalCode: true, country: true },
      })
      if (
        hasDuplicateAddress(
          { addressLine1, city, state, postalCode, country },
          existingAddresses as any
        )
      ) {
        return badRequest('A branch with this address already exists', {
          addressLine1: 'Duplicate address for this merchant',
        })
      }
    }

    if (isPrimary === true) {
      await prisma.merchantBranch.updateMany({
        where: { merchantId: merchant.id, isPrimary: true, deletedAt: null },
        data: { isPrimary: false },
      })
    }

    const branch = await prisma.merchantBranch.create({
      data: {
        merchantId: merchant.id,
        name: name.trim(),
        addressLine1: addressLine1?.trim() ?? '',
        addressLine2: addressLine2?.trim() ?? null,
        city: city?.trim() ?? '',
        state: state?.trim() ?? null,
        postalCode: postalCode?.trim() ?? '',
        country: country?.trim() ?? '',
        phone: phone?.trim() ?? null,
        email: email?.trim() ?? null,
        latitude: latitude != null ? new Prisma.Decimal(latitude) : null,
        longitude: longitude != null ? new Prisma.Decimal(longitude) : null,
        openingHours: openingHours ?? DEFAULT_OPENING_HOURS,
        isPrimary: Boolean(isPrimary),
        branchType: branchType ?? 'IN_STORE',
        deliveryRadiusKm: deliveryRadiusKm ?? null,
        isNationwide: Boolean(isNationwide),
        storefrontImageUrl: storefrontImageUrl ?? null,
        branchImages: Array.isArray(branchImages) ? branchImages : [],
        parkingInfo: parkingInfo ?? null,
        wheelchairAccess: Boolean(wheelchairAccess),
        landmark: landmark ?? null,
        description: description ?? null,
        status: 'ACTIVE',
        isActive: true,
      },
    })

    await createAuditLog({
      actorType: 'merchant',
      actorId: merchant.id,
      action: 'BRANCH_CREATED',
      entityType: 'merchant_branch',
      entityId: branch.id,
      changes: { branchName: branch.name, branchType: branch.branchType, isPrimary: branch.isPrimary } as any,
    })

    await publishBusinessNotification({
      type: 'SYSTEM',
      title: `Branch created: ${branch.name}`,
      message: 'A new branch was created for your merchant account.',
      priority: 'NORMAL',
      recipients: [{ role: 'merchant', id: merchant.id }],
      channels: channels('IN_APP'),
      referenceType: 'merchant_branch',
      referenceId: branch.id,
      metadata: { merchantId: merchant.id },
    })

    return NextResponse.json({ success: true, data: branch, message: 'Branch created' }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return badRequest('A branch with these details already exists')
    }
    return internalError(error)
  }
}
