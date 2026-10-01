import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service'
import { createCategorySchema, slugifyCategory } from '@/features/categories/schemas'
import { CATEGORY_ICON_MAX_LENGTH, categoryLogoPathFromUrl } from '@/features/categories/logo'
import {
  apiError,
  categorySelect,
  findCategoryByName,
  requireAdminUser,
  toAdminCategoryRow,
  uniqueCategorySlug,
} from '@/services/category-admin.service'

const MERCHANT_PREVIEW_COUNT = 5

// GET /api/admin/categories — every category (active or not) with merchant counts.
export async function GET() {
  const auth = await requireAdminUser()
  if (!auth.ok) return auth.response

  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: categorySelect(MERCHANT_PREVIEW_COUNT),
    })
    return NextResponse.json({ success: true, data: categories.map(toAdminCategoryRow) })
  } catch (error) {
    console.error('Admin categories list error:', error)
    return apiError(500, 'INTERNAL', 'Failed to fetch categories')
  }
}

// POST /api/admin/categories — create a category with an optional uploaded logo.
export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = createCategorySchema.safeParse(body)
  if (!parsed.success) {
    return apiError(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Validation failed')
  }
  const { name, description, logoUrl } = parsed.data

  let icon: string | null = null
  if (logoUrl) {
    icon = categoryLogoPathFromUrl(logoUrl)
    if (!icon) return apiError(400, 'VALIDATION', 'Logo must be uploaded through the category form')
    if (icon.length > CATEGORY_ICON_MAX_LENGTH) {
      return apiError(400, 'VALIDATION', 'Logo file name is too long. Rename the file and try again.')
    }
  }

  const baseSlug = slugifyCategory(name)
  if (!baseSlug) return apiError(400, 'VALIDATION', 'Name must contain letters or numbers')

  try {
    if (await findCategoryByName(name)) {
      return apiError(409, 'CONFLICT', 'A category with this name already exists')
    }
    const slug = await uniqueCategorySlug(baseSlug)

    const last = await prisma.category.aggregate({ _max: { displayOrder: true } })
    const created = await prisma.category.create({
      data: {
        name,
        slug,
        description: description ?? null,
        icon,
        displayOrder: (last._max.displayOrder ?? -1) + 1,
        isActive: true,
      },
      select: categorySelect(MERCHANT_PREVIEW_COUNT),
    })

    await createAuditLog(
      fromCurrentUser(auth.user, 'CATEGORY_CREATED', 'category', created.id, {
        changes: { name, slug, description: description ?? null, logo: icon },
      }),
    )

    return NextResponse.json(
      { success: true, data: toAdminCategoryRow(created), message: 'Category created' },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError(409, 'CONFLICT', 'A category with this name already exists')
    }
    console.error('Admin category create error:', error)
    return apiError(500, 'INTERNAL', 'Failed to create category')
  }
}
