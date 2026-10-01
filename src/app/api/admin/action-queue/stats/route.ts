import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { ActionQueueStatus, ActionQueueType } from '@prisma/client'
import { getStaleOfferQueueItemIds } from '@/lib/action-queue-stale'

// Map categories to actual Prisma ActionQueueType enum values
const CATEGORY_TO_QUEUE_TYPE = {
  merchantApplications: 'NEW_MERCHANT_APPLICATION',
  offerApprovals: 'FIRST_OFFER_APPROVAL',
  offerReplacements: 'OFFER_REPLACEMENT',
  profileChanges: 'PROFILE_EDIT_REQUEST',
  companyActivations: 'COMPANY_ACTIVATION',
  openIssues: 'ISSUE_REVIEW',
} as const

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser()
    
    if (!user || user.userType !== 'admin') return unauthorized()


    // Get all pending items with their types
    const allPendingItems = await prisma.actionQueueItem.findMany({
      where: { status: 'PENDING' },
      select: {
        id: true,
        status: true,
        type: true, // This is the ActionQueueType enum field
        metadata: true,
        createdAt: true,
      },
    })
    
    
    // Soft-delete guard: offer-type items whose referenced offer was
    // deleted must not count toward badges (the list excludes them too).
    const staleItemIds = await getStaleOfferQueueItemIds()
    const staleSet = new Set(staleItemIds)
    const staleFilter = staleItemIds.length > 0 ? { id: { notIn: staleItemIds } } : {}

    // Count by type using actual ActionQueueType enum values
    const merchantApplications = await prisma.merchant.count({
  where: {
    OR: [
      { status: 'PENDING' },
    ],
  },
})
    const offerApprovals = allPendingItems.filter(i => i.type === 'FIRST_OFFER_APPROVAL' && !staleSet.has(i.id)).length
    const offerReplacements = allPendingItems.filter(i => i.type === 'OFFER_REPLACEMENT' && !staleSet.has(i.id)).length
    const profileChanges = allPendingItems.filter(i => i.type === 'PROFILE_EDIT_REQUEST').length
    const companyActivations = allPendingItems.filter(i => i.type === 'COMPANY_ACTIVATION').length
    const openIssues = allPendingItems.filter(i => i.type === 'ISSUE_REVIEW').length

    // Types not yet in the Prisma enum default to 0
    const setupLinks = 0
    const renewalAlerts = 0
    const missingPerks = 0

    // Get counts by status
    const [totalPending, totalInProgress, totalCompleted, totalFailed, totalSkipped] = await Promise.all([
      prisma.actionQueueItem.count({ where: { status: 'PENDING', ...staleFilter } }),
      prisma.actionQueueItem.count({ where: { status: 'IN_PROGRESS', ...staleFilter } }),
      prisma.actionQueueItem.count({ where: { status: 'COMPLETED' } }),
      prisma.actionQueueItem.count({ where: { status: 'FAILED' } }),
      prisma.actionQueueItem.count({ where: { status: 'SKIPPED' } }),
    ])
    
    const totalOfferApprovals = offerApprovals + offerReplacements + profileChanges
    const totalAlerts = renewalAlerts + missingPerks
    
    return NextResponse.json({
      success: true,
      data: {
        merchantApplications,
        offerApprovals,
        offerReplacements,
        profileChanges,
        companyActivations,
        openIssues,
        renewalAlerts,
        missingPerks,
        totalOfferApprovals,
        totalAlerts,
        totalPending,
        totalInProgress,
        totalCompleted,
        totalFailed,
        totalSkipped,
        byTab: {
          ALL: totalPending + totalInProgress,
          MERCHANT_APPROVAL: merchantApplications,
          OFFER_APPROVAL: totalOfferApprovals,
          COMPANY_ACTIVATION: companyActivations,
          ISSUES: openIssues,
          ALERTS: totalAlerts,
        },
      },
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function unauthorized() {
  return NextResponse.json(
    { success: false, error: 'Unauthorized' },
    { status: 401 }
  )
}