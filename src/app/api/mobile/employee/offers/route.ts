import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import {  getMobileHomeHeavy, type Location } from '@/services/mobile-home.service'
import { createAuditLog } from '@/services/audit-log.service'
import { internalError } from '@/lib/employee-helpers'

// Parses optional `lat` / `lng` query parameters. Returns null when either
// is missing or out of range so the service can fall back to its
// non-location-aware ranking.
function parseLocation(searchParams: URLSearchParams): Location | null {
  const latRaw = searchParams.get('lat')
  const lngRaw = searchParams.get('lng')
  if (!latRaw || !lngRaw) return null
  const lat = Number(latRaw)
  const lng = Number(lngRaw)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { latitude: lat, longitude: lng }
}

export async function GET(request: NextRequest) {
  try {
    // Single source of truth for mobile auth. Enforces:
    //   - Supabase Bearer token validity
    //   - Account.status === 'ACTIVE'
    //   - Account.role   === 'EMPLOYEE'
    //   - Employee exists and is ACTIVE (not soft-deleted)
    //   - Company exists, not deleted, and not PAUSED/SUSPENDED/CANCELLED
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response
    const { employee, company } = auth

    const location = parseLocation(request.nextUrl.searchParams)
    const data = await getMobileHomeHeavy({ employee, location })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return internalError(error)
  }
}
