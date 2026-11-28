import { NextResponse } from 'next/server'
import { getMerchantFromSession } from '@/lib/merchant-session'
import { generateUniqueOfferCode } from '@/lib/offer-code'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 },
  )
}

/** Generate a promo code that no other offer (live or not) already uses. */
export async function POST(request: Request) {
  const merchant = await getMerchantFromSession()
  if (!merchant) return unauthorized()

  const body = await request.json().catch(() => ({}))
  const requestedLength = Number(body?.length)
  const code = await generateUniqueOfferCode(
    Number.isFinite(requestedLength) && requestedLength > 0 ? requestedLength : undefined,
  )

  return NextResponse.json({ success: true, data: { code } })
}
