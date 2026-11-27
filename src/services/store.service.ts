import { PHYSICAL_BRANCH_TYPES } from '@/lib/branch-helpers';
import { prisma } from '@/lib/prisma'
import { normalizeOpeningHours } from '@/lib/branch-helpers'

export interface AdminStoreBranch {
  id: string
  merchantId: string
  merchantName: string
  merchantLogo: string | null
  merchantStatus: string
  category: string | null
  branchName: string
  address: {
    line1: string
    line2: string | null
    city: string
    state: string | null
    postalCode: string
    country: string
  }
  latitude: number | null
  longitude: number | null
  phone: string | null
  email: string | null
  openingHours: unknown
  isPrimary: boolean
  status: string
  createdAt: string
}

export interface AdminStoresResponse {
  branches: AdminStoreBranch[]
  summary: {
    total: number
    active: number
    primary: number
    inactive: number
    cities: number
  }
}

function computeIsOpen(hours: unknown): boolean {
  const parsed = normalizeOpeningHours(hours)
  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  const now = new Date()
  const today = dayNames[now.getDay()]
  const entry = parsed.find((h) => h.day === today)
  if (!entry || entry.closed) return false
  const [openH, openM] = entry.open.split(':').map(Number)
  const [closeH, closeM] = entry.close.split(':').map(Number)
  if (openH == null || openM == null || closeH == null || closeM == null) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= openH * 60 + openM && mins < closeH * 60 + closeM
}

export interface FetchAdminStoresOptions {
  category?: string | null
  city?: string | null
  state?: string | null
  merchantId?: string | null
  status?: string | null
  isPrimary?: boolean | null
  search?: string | null
}

export async function fetchAdminStores(
  opts: FetchAdminStoresOptions = {}
): Promise<AdminStoresResponse> {
  const where: Record<string, unknown> = {
    deletedAt: null,
    branchType: { in: [...PHYSICAL_BRANCH_TYPES] },
  }

  if (opts.merchantId) where.merchantId = opts.merchantId
  if (opts.status) where.status = opts.status
  if (opts.isPrimary != null) where.isPrimary = opts.isPrimary
  if (opts.city) where.city = { contains: opts.city, mode: 'insensitive' }
  if (opts.state) where.state = { contains: opts.state, mode: 'insensitive' }

  if (opts.search) {
    where.OR = [
      { name: { contains: opts.search, mode: 'insensitive' } },
      { addressLine1: { contains: opts.search, mode: 'insensitive' } },
      { city: { contains: opts.search, mode: 'insensitive' } },
      { merchant: { businessName: { contains: opts.search, mode: 'insensitive' } } },
    ]
  }

  const branches = await prisma.merchantBranch.findMany({
    where: {
      ...where,                         // keep your existing filters
      merchant: {
        status: 'ACTIVE',               // only include branches of active merchants
      },
    },
    include: {
      merchant: {
        select: {
          id: true,
          businessName: true,
          logoUrl: true,
          status: true,
          category: { select: { name: true } },
        },
      },
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })

  let results: AdminStoreBranch[] = branches.map((b) => {
    const lat = b.latitude != null ? Number(b.latitude) : null
    const lng = b.longitude != null ? Number(b.longitude) : null
    return {
      id: b.id,
      merchantId: b.merchantId,
      merchantName: b.merchant.businessName,
      merchantLogo: b.merchant.logoUrl ?? null,
      merchantStatus: b.merchant.status,
      category: b.merchant.category?.name ?? null,
      branchName: b.name,
      address: {
        line1: b.addressLine1,
        line2: b.addressLine2,
        city: b.city,
        state: b.state,
        postalCode: b.postalCode,
        country: b.country,
      },
      latitude: lat,
      longitude: lng,
      phone: b.phone,
      email: b.email,
      openingHours: b.openingHours,
      isPrimary: b.isPrimary,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    }
  })

  if (opts.category) {
    results = results.filter((r) => r.category === opts.category)
  }

  const cities = new Set(results.map((r) => r.address.city).filter(Boolean))

  return {
    branches: results,
    summary: {
      total: results.length,
      active: results.filter((r) => r.status === 'ACTIVE').length,
      primary: results.filter((r) => r.isPrimary).length,
      inactive: results.filter((r) => r.status === 'INACTIVE' || r.status === 'CLOSED').length,
      cities: cities.size,
    },
  }
}

export async function fetchAdminStoreFilters(): Promise<{
  categories: string[]
  cities: string[]
  states: string[]
  merchants: { id: string; name: string }[]
}> {
  const branches = await prisma.merchantBranch.findMany({
    where: { deletedAt: null, branchType: { in: [...PHYSICAL_BRANCH_TYPES] } },
    select: {
      city: true,
      state: true,
      merchant: {
        select: {
          id: true,
          businessName: true,
          category: { select: { name: true } },
        },
      },
    },
  })

  const categoriesSet = new Set<string>()
  const citiesSet = new Set<string>()
  const statesSet = new Set<string>()
  const merchantsMap = new Map<string, string>()

  for (const b of branches) {
    if (b.city) citiesSet.add(b.city)
    if (b.state) statesSet.add(b.state)
    if (b.merchant.category?.name) categoriesSet.add(b.merchant.category.name)
    merchantsMap.set(b.merchant.id, b.merchant.businessName)
  }

  return {
    categories: [...categoriesSet].sort(),
    cities: [...citiesSet].sort(),
    states: [...statesSet].sort(),
    merchants: [...merchantsMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}
