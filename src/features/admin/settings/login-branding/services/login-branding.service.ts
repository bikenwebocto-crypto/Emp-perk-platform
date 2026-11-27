import { prisma } from '@/lib/prisma'
import { safeQuery } from '@/lib/prisma/safe-query'

export type PublicBranding = {
  appName: string | null
  tagline: string | null
  heading: string | null
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
  accentColor: string | null
  textColor: string | null
  cardBackground: string | null
  backgroundImageUrl: string | null
  layout: string
  showLogo: boolean
  showHeading: boolean
  showDescription: boolean
  showBanner: boolean
  showFooter: boolean
  footerTitle: string | null
  footerDescription: string | null
  copyright: string | null
}

let cachedBranding: PublicBranding | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000

function isCacheValid(): boolean {
  return cachedBranding !== null && Date.now() - cacheTimestamp < CACHE_TTL
}

const DEFAULT_BRANDING: PublicBranding = {
  appName: 'PerksGo',
  tagline: null,
  heading: 'Sign in',
  description: 'Sign in to continue to your dashboard.',
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
  accentColor: null,
  textColor: null,
  cardBackground: null,
  layout: 'SPLIT_CARD',
  showLogo: true,
  showHeading: true,
  showDescription: true,
  showBanner: true,
  showFooter: true,
  footerTitle: null,
  footerDescription: null,
  copyright: null,
  backgroundImageUrl: null,
}

function mapBrandingToPublic(row: {
  appName: string | null
  tagline: string | null
  heading: string | null
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  backgroundImageUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
  accentColor: string | null
  textColor: string | null
  cardBackground: string | null
  layout: string
  showLogo: boolean
  showHeading: boolean
  showDescription: boolean
  showBanner: boolean
  showFooter: boolean
  footerTitle: string | null
  footerDescription: string | null
  copyright: string | null
}): PublicBranding {
  return {
    appName: row.appName,
    tagline: row.tagline,
    heading: row.heading,
    description: row.description,
    backgroundImageUrl: row.backgroundImageUrl,
    logoUrl: row.logoUrl,
    bannerUrl: row.bannerUrl,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    accentColor: row.accentColor,
    textColor: row.textColor,
    cardBackground: row.cardBackground,
    layout: row.layout,
    showLogo: row.showLogo,
    showHeading: row.showHeading,
    showDescription: row.showDescription,
    showBanner: row.showBanner,
    showFooter: row.showFooter,
    footerTitle: row.footerTitle,
    footerDescription: row.footerDescription,
    copyright: row.copyright,
  }
}

export async function getPublicBranding(): Promise<PublicBranding> {
  if (isCacheValid()) {
    return cachedBranding!
  }

  const row = await safeQuery(
    () => prisma.loginBranding.findFirst({ orderBy: { createdAt: 'desc' } }),
    null,
    { context: 'LoginBranding.findFirst' },
  )

  const result = row
    ? mapBrandingToPublic(row)
    : DEFAULT_BRANDING

  cachedBranding = result
  cacheTimestamp = Date.now()

  return result
}

export async function getAdminBranding() {
  return safeQuery(
    () => prisma.loginBranding.findFirst({ orderBy: { createdAt: 'desc' } }),
    null,
    { context: 'LoginBranding.findFirst:getAdminBranding' },
  )
}

export async function upsertBranding(data: Record<string, unknown>) {
  const existing = await prisma.loginBranding.findFirst({ orderBy: { createdAt: 'desc' } })

  let row
  if (existing) {
    row = await prisma.loginBranding.update({
      where: { id: existing.id },
      data: data as any,
    })
  } else {
    row = await prisma.loginBranding.create({
      data: data as any,
    })
  }

  cachedBranding = null

  return row
}
