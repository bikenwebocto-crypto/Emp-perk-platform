import { PHYSICAL_BRANCH_TYPES } from '@/lib/branch-helpers';
import { prisma } from '@/lib/prisma'
import { normalizeOpeningHours } from '@/lib/branch-helpers'

export interface StoreBranch {
  id: string
  merchantId: string
  merchantName: string
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
  category: string | null
  logo: string | null
  distanceKm: number | null
  isOpen: boolean
  openingHours: unknown
  googleMapsUrl: string | null
  isPrimary: boolean
  status: string
  createdAt: string
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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

function buildGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

interface FetchBranchesOptions {
  merchantId?: string
  userLat?: number | null
  userLng?: number | null
  category?: string | null
  maxDistanceKm?: number | null
  openNow?: boolean
  status?: string | null
  isPrimary?: boolean | null
}

export async function fetchStoreBranches(opts: FetchBranchesOptions): Promise<StoreBranch[]> {
  const where: Record<string, unknown> = {
    deletedAt: null,
    branchType: { in: [...PHYSICAL_BRANCH_TYPES] },
  }
  if (opts.merchantId) where.merchantId = opts.merchantId
  if (opts.status) where.status = opts.status
  if (opts.isPrimary != null) where.isPrimary = opts.isPrimary

  const branches = await prisma.merchantBranch.findMany({
    where,
    include: { merchant: { select: { id: true, businessName: true, logoUrl: true, category: true } } },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })

  let results: StoreBranch[] = branches.map((b) => {
    const lat = b.latitude != null ? Number(b.latitude) : null
    const lng = b.longitude != null ? Number(b.longitude) : null
    const distanceKm =
      lat != null && lng != null && opts.userLat != null && opts.userLng != null
        ? haversineKm(opts.userLat, opts.userLng, lat, lng)
        : null
    return {
      id: b.id,
      merchantId: b.merchantId,
      merchantName: b.merchant.businessName,
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
      category: b.merchant.category?.name ?? null,
      logo: b.merchant.logoUrl ?? null,
      distanceKm: distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
      isOpen: computeIsOpen(b.openingHours),
      openingHours: b.openingHours,
      googleMapsUrl: lat != null && lng != null ? buildGoogleMapsUrl(lat, lng) : null,
      isPrimary: b.isPrimary,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    }
  })

  if (opts.category) {
    results = results.filter((r) => r.category === opts.category)
  }
  if (opts.maxDistanceKm != null && opts.userLat != null && opts.userLng != null) {
    results = results.filter((r) => r.distanceKm != null && r.distanceKm <= opts.maxDistanceKm!)
  }
  if (opts.openNow) {
    results = results.filter((r) => r.isOpen)
  }
  if (opts.userLat != null && opts.userLng != null) {
    results.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
  }

  return results
}
