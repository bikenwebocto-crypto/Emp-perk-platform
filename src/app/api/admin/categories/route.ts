import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service'
import { createCategorySchema, slugifyCategory } from '@/features/categories/schemas'
import { isCompleteCategoryOrder } from '@/features/categories/order'
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
const reorderCategoriesSchema = z.object({
  categoryIds: z.array(z.string().uuid()).max(500),
})

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
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.category.create({
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
        fromCurrentUser(auth.user, 'CATEGORY_CREATED', 'category', row.id, {
          changes: { name, slug, description: description ?? null, logo: icon },
        }),
        tx,
      )
      return row
    })

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

// PATCH /api/admin/categories — replace the full display order.
export async function PATCH(request: NextRequest) {
  const auth = await requireAdminUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null)
  const parsed = reorderCategoriesSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(400, 'VALIDATION', 'Provide the ordered category IDs')
  }

  const categoryIds = parsed.data.categoryIds
  if (new Set(categoryIds).size !== categoryIds.length) {
    return apiError(400, 'VALIDATION', 'Category IDs must be unique')
  }

  try {
    const reordered = await prisma.$transaction(async (tx) => {
      const current = await tx.category.findMany({ select: { id: true } })
      if (!isCompleteCategoryOrder(categoryIds, current.map((category) => category.id))) {
        return false
      }

      for (const [displayOrder, id] of categoryIds.entries()) {
        await tx.category.update({ where: { id }, data: { displayOrder } })
      }
      if (categoryIds[0]) {
        await createAuditLog(
          fromCurrentUser(auth.user, 'CATEGORIES_REORDERED', 'category', categoryIds[0], {
            changes: { categoryIds },
          }),
          tx,
        )
      }
      return true
    })

    if (!reordered) {
      return apiError(409, 'CATEGORY_ORDER_CHANGED', 'Categories changed. Refresh the list and try again.')
    }

    return NextResponse.json({ success: true, data: { categoryIds }, message: 'Category order updated' })
  } catch (error) {
    console.error('Admin category reorder error:', error)
    return apiError(500, 'INTERNAL', 'Failed to reorder categories')
  }
}
