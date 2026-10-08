import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'

// GET /api/admin/sidebar-counts
//
// Open-work counts for the admin sidebar badges, in one round trip.
// (Leads keep their own badge via useNewLeadCount.)
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 },
      )
    }

    const [actionQueue, replacements, merchants, merchantSuggestions, tickets] = await Promise.all([
      prisma.actionQueueItem.count({ where: { status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
      prisma.offerReplacementRequest.count({ where: { status: { in: ['PENDING', 'AWAITING_APPROVAL'] } } }),
      prisma.merchant.count({ where: { status: 'PENDING', deletedAt: null } }),
      prisma.merchantSuggestion.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
      prisma.complaint.count({ where: { status: { notIn: ['RESOLVED', 'REJECTED'] } } }),
    ])

    return NextResponse.json({
      success: true,
      data: { actionQueue, replacements, merchants, merchantSuggestions, tickets },
    })
  } catch (error) {
    console.error('[GET /api/admin/sidebar-counts]', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
