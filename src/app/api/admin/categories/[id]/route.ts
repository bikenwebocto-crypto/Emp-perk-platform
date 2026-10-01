import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getAdminClient } from '@/lib/supabase/admin'
import { CATEGORY_LOGO_OPTIONS, deleteImage } from '@/lib/upload/image'
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service'
import {
  CATEGORY_ICON_MAX_LENGTH,
  categoryLogoPathFromUrl,
  categoryLogoUrl,
  isCategoryLogoPath,
} from '@/features/categories/logo'
import { slugifyCategory, updateCategorySchema } from '@/features/categories/schemas'
import {
  apiError,
  categorySelect,
  findCategoryByName,
  requireAdminUser,
  toAdminCategoryRow,
  uniqueCategorySlug,
} from '@/services/category-admin.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class CategoryInUseError extends Error {
  constructor(public merchantCount: number) {
    super('Category in use')
  }
}

// GET /api/admin/categories/[id] — category with its full merchant list.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!UUID_RE.test(id)) return apiError(404, 'NOT_FOUND', 'Category not found')

  try {
    const category = await prisma.category.findUnique({ where: { id }, select: categorySelect() })
    if (!category) return apiError(404, 'NOT_FOUND', 'Category not found')
    return NextResponse.json({ success: true, data: toAdminCategoryRow(category) })
  } catch (error) {
    console.error('Admin category fetch error:', error)
    return apiError(500, 'INTERNAL', 'Failed to fetch category')
  }
}

// PATCH /api/admin/categories/[id] — edit name, description, logo or active flag.
// Editing is always allowed; only deletion is blocked by linked merchants.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!UUID_RE.test(id)) return apiError(404, 'NOT_FOUND', 'Category not found')

  const body = await request.json().catch(() => null)
  const parsed = updateCategorySchema.safeParse(body)
  if (!parsed.success) {
    return apiError(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Validation failed')
  }
  const input = parsed.data

  try {
    const existing = await prisma.category.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, description: true, icon: true, isActive: true },
    })
    if (!existing) return apiError(404, 'NOT_FOUND', 'Category not found')

    const data: Prisma.CategoryUpdateInput = {}
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}

    if (input.name !== undefined && input.name !== existing.name) {
      const baseSlug = slugifyCategory(input.name)
      if (!baseSlug) return apiError(400, 'VALIDATION', 'Name must contain letters or numbers')
      if (await findCategoryByName(input.name, id)) {
        return apiError(409, 'CONFLICT', 'A category with this name already exists')
      }
      data.name = input.name
      data.slug = existing.slug === baseSlug ? existing.slug : await uniqueCategorySlug(baseSlug, id)
      before.name = existing.name
      after.name = input.name
      if (data.slug !== existing.slug) {
        before.slug = existing.slug
        after.slug = data.slug
      }
    }

    if (input.description !== undefined && input.description !== existing.description) {
      data.description = input.description
      before.description = existing.description
      after.description = input.description
    }

    if (input.isActive !== undefined && input.isActive !== existing.isActive) {
      data.isActive = input.isActive
      before.isActive = existing.isActive
      after.isActive = input.isActive
    }

    // Logo: icon stores the storage path; legacy icon names are kept unless a new logo replaces them.
    let replacedLogoPath: string | null = null
    if (input.logoUrl !== undefined) {
      if (input.logoUrl === null) {
        if (isCategoryLogoPath(existing.icon)) {
          data.icon = null
          replacedLogoPath = existing.icon
        }
      } else {
        const path = categoryLogoPathFromUrl(input.logoUrl)
        if (!path) return apiError(400, 'VALIDATION', 'Logo must be uploaded through the category form')
        if (path.length > CATEGORY_ICON_MAX_LENGTH) {
          return apiError(400, 'VALIDATION', 'Logo file name is too long. Rename the file and try again.')
        }
        if (path !== existing.icon) {
          data.icon = path
          if (isCategoryLogoPath(existing.icon)) replacedLogoPath = existing.icon
        }
      }
      if (data.icon !== undefined) {
        before.logo = existing.icon
        after.logo = data.icon
      }
    }

    if (Object.keys(after).length === 0) {
      const current = await prisma.category.findUnique({ where: { id }, select: categorySelect(5) })
      return NextResponse.json({ success: true, data: current && toAdminCategoryRow(current), message: 'No changes' })
    }

    const updated = await prisma.category.update({ where: { id }, data, select: categorySelect(5) })

    if (replacedLogoPath) {
      const oldUrl = categoryLogoUrl(replacedLogoPath)
      if (oldUrl) void deleteImage(oldUrl, { bucket: CATEGORY_LOGO_OPTIONS.bucket, supabase: getAdminClient() })
    }

    await createAuditLog(
      fromCurrentUser(auth.user, 'CATEGORY_UPDATED', 'category', id, {
        changes: { before, after, changedFields: Object.keys(after) },
      }),
    )

    return NextResponse.json({ success: true, data: toAdminCategoryRow(updated), message: 'Category updated' })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError(409, 'CONFLICT', 'A category with this name already exists')
    }
    console.error('Admin category update error:', error)
    return apiError(500, 'INTERNAL', 'Failed to update category')
  }
}

// DELETE /api/admin/categories/[id] — only allowed when no merchant (incl. soft-deleted) is linked.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!UUID_RE.test(id)) return apiError(404, 'NOT_FOUND', 'Category not found')

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id },
        select: { id: true, name: true, slug: true, icon: true },
      })
      if (!category) return null

      // Checked inside the transaction; Merchant.categoryId would otherwise be
      // silently set to NULL by the optional relation's default ON DELETE SET NULL.
      const merchantCount = await tx.merchant.count({ where: { categoryId: id } })
      if (merchantCount > 0) throw new CategoryInUseError(merchantCount)

      await tx.category.delete({ where: { id } })
      return category
    })

    if (!deleted) return apiError(404, 'NOT_FOUND', 'Category not found')

    if (isCategoryLogoPath(deleted.icon)) {
      const url = categoryLogoUrl(deleted.icon)
      if (url) void deleteImage(url, { bucket: CATEGORY_LOGO_OPTIONS.bucket, supabase: getAdminClient() })
    }

    await createAuditLog(
      fromCurrentUser(auth.user, 'CATEGORY_DELETED', 'category', id, {
        changes: { name: deleted.name, slug: deleted.slug },
      }),
    )

    return NextResponse.json({ success: true, data: { id }, message: 'Category deleted' })
  } catch (error) {
    if (error instanceof CategoryInUseError) {
      return apiError(
        409,
        'CATEGORY_IN_USE',
        `This category is linked to ${error.merchantCount} merchant${error.merchantCount === 1 ? '' : 's'}. Move them to another category first.`,
      )
    }
    console.error('Admin category delete error:', error)
    return apiError(500, 'INTERNAL', 'Failed to delete category')
  }
}
