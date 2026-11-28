import { NextRequest, NextResponse } from 'next/server'
import { internalError, notFound, badRequest } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { createAuditLog } from '@/services/audit-log.service'
import { recordOfferView } from '@/lib/offers/record-offer-view'

// POST /api/mobile/offers/[id]/click
//
// Records a view for the offer, counted once per employee (see
// recordOfferView). GET /api/mobile/offers/[id] already records the view
// on open, so calling this as well is safe and never double counts.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const { id } = await params
    if (!id) return badRequest('Offer id is required')

    const result = await recordOfferView(id, auth.employee.id)
    if (!result.recorded) {
      return notFound(result.reason)
    }

    if (result.firstView) {
      await createAuditLog({
        actorType: 'employee',
        actorId: auth.employee.id,
        action: 'OFFER_VIEWED',
        entityType: 'merchantOffer',
        entityId: id,
        metadata: { loginSource: 'mobile' },
      })
    }

    return NextResponse.json({ success: true, firstView: result.firstView })
  } catch (error) {
    return internalError(error)
  }
}
