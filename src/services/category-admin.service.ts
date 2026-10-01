import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, type CurrentUser } from '@/lib/supabase/server'
import { categoryLogoUrl, isCategoryLogoPath } from '@/features/categories/logo'
import type { AdminCategoryRow } from '@/features/categories/types'

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

/** Platform admins only (Account.role SUPER_ADMIN → userType 'admin'). */
export async function requireAdminUser(): Promise<
  { ok: true; user: CurrentUser } | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, response: apiError(401, 'UNAUTHORIZED', 'Unauthorized') }
  if (user.userType !== 'admin') return { ok: false, response: apiError(403, 'FORBIDDEN', 'Forbidden') }
  return { ok: true, user }
}

/** `base`, or `base-2`, `base-3`… if another category already uses it. */
export async function uniqueCategorySlug(base: string, excludeId?: string): Promise<string> {
  const taken = await prisma.category.findMany({
    where: { slug: { startsWith: base }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { slug: true },
  })
  const used = new Set(taken.map((t) => t.slug))
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, 95)}-${n}`
    if (!used.has(candidate)) return candidate
  }
}

/** Case-insensitive name clash with another category. */
export function findCategoryByName(name: string, excludeId?: string) {
  return prisma.category.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  })
}

export function categorySelect(merchantTake?: number) {
  return {
    id: true,
    name: true,
    slug: true,
    description: true,
    icon: true,
    isActive: true,
    displayOrder: true,
    createdAt: true,
    _count: { select: { merchants: true } },
    merchants: {
      select: { id: true, businessName: true, logoUrl: true, status: true, deletedAt: true },
      orderBy: { businessName: 'asc' as const },
      ...(merchantTake ? { take: merchantTake } : {}),
    },
  } satisfies Prisma.CategorySelect
}

type CategoryWithMerchants = Prisma.CategoryGetPayload<{ select: ReturnType<typeof categorySelect> }>

export function toAdminCategoryRow(c: CategoryWithMerchants): AdminCategoryRow {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    icon: isCategoryLogoPath(c.icon) ? null : c.icon,
    logoUrl: categoryLogoUrl(c.icon),
    isActive: c.isActive,
    displayOrder: c.displayOrder,
    createdAt: c.createdAt.toISOString(),
    merchantCount: c._count.merchants,
    merchants: c.merchants.map((m) => ({
      id: m.id,
      businessName: m.businessName,
      logoUrl: m.logoUrl,
      status: m.status,
      deleted: m.deletedAt !== null,
    })),
  }
}
