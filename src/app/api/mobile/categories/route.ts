import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { internalError } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { safeQuery } from '@/lib/prisma/safe-query'
import { categoryLogoUrl, isCategoryLogoPath } from '@/features/categories/logo'

// GET /api/mobile/categories
//
// Active global categories available to all employees. Returns the
// platform-wide category list so employees can filter/browse merchants
// across the full taxonomy regardless of which company they belong to.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const categories = await safeQuery(
      () =>
        prisma.category.findMany({
          where: { isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            icon: true,
          },
        }),
      [],
      { context: 'Category.findMany:mobile-active' },
    )

    // Category.icon holds either an uploaded logo's storage path or a legacy
    // icon name — expose the logo as a full public URL and keep icon for names only.
    const data = categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      icon: isCategoryLogoPath(c.icon) ? null : c.icon,
      logoUrl: categoryLogoUrl(c.icon),
    }))

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return internalError(error)
  }
}
