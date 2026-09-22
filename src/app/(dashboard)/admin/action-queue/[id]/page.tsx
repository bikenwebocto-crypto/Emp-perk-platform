'use client'

import { use, useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Edit3,
  Sparkles,
  Shield,
  Info,
  History,
  Loader2,
  Check,
  X as XIcon,
  FileText,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import { Skeleton } from '@/components/ui/skeleton'
import { showToast } from '@/hooks/use-toast'
import { ReviewHeader } from '@/components/admin/action-queue/ReviewHeader'
import { OfferPreviewSection } from '@/components/merchant/offers/OfferPreviewSection'
import {
  REVIEW_COMPONENT_MAP,
  EDITABLE_FIELDS_MAP,
  EntityNotFound,
  EditFieldsForm,
  RemarksPanel,
  AuditTimeline,
  RejectDialog,
  type ReviewComponentKey,
} from '@/components/admin/action-queue/reviews'
import {
  QUEUE_TYPE_MAP,
  getEntityKindFromReferenceType,
  getQueueTypeFromEntityKind,
  getQueueTypeMapping,
} from '@/lib/action-queue-types'

function resolveReviewComponentKey(queueItem: any): ReviewComponentKey {
  const meta = (queueItem?.metadata as any) ?? {}
  const queueType = meta.queueType as string | undefined

  if (queueType && QUEUE_TYPE_MAP[queueType]) {
    return QUEUE_TYPE_MAP[queueType].reviewComponent as ReviewComponentKey
  }

  const kind = getEntityKindFromReferenceType(queueItem?.referenceType)
  const fallbackType = getQueueTypeFromEntityKind(kind)
  if (fallbackType && QUEUE_TYPE_MAP[fallbackType]) {
    return QUEUE_TYPE_MAP[fallbackType].reviewComponent as ReviewComponentKey
  }

  if (queueItem?.type === 'OFFER_REPLACEMENT') return 'OfferReplacementReview'
  if (queueItem?.type === 'PROFILE_EDIT_REQUEST') return 'ProfileReview'
  if (queueItem?.type === 'FIRST_OFFER_APPROVAL') return 'OfferReview'
  if (queueItem?.type === 'NEW_MERCHANT_APPLICATION') return 'MerchantApplicationReview'
  if (queueItem?.type === 'COMPANY_ACTIVATION') return 'CompanyActivationReview'
  if (queueItem?.type === 'ISSUE_REVIEW') return 'IssueReview'

  return 'MerchantApplicationReview'
}

function resolveDisplayType(queueItem: any): string {
  const meta = (queueItem?.metadata as any) ?? {}
  const queueType = meta.queueType as string | undefined
  const mapping = getQueueTypeMapping(queueType)
  if (mapping) return mapping.displayType

  const kind = getEntityKindFromReferenceType(queueItem?.referenceType)
  const kindMapping = QUEUE_TYPE_MAP[getQueueTypeFromEntityKind(kind) ?? '']
  if (kindMapping) return kindMapping.displayType

  return (queueItem?.type ?? 'Action Item').replace(/_/g, ' ')
}

function hasEntityContent(entity: any, kind: string): boolean {
  if (!entity) return false
  if (typeof entity !== 'object') return false
  return Object.keys(entity).length > 0
}

function statusGradient(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'from-amber-500 to-orange-600'
    case 'IN_PROGRESS':
      return 'from-blue-500 to-indigo-600'
    case 'COMPLETED':
      return 'from-emerald-500 to-teal-600'
    case 'FAILED':
      return 'from-rose-500 to-red-600'
    case 'SKIPPED':
      return 'from-gray-400 to-gray-600'
    default:
      return 'from-violet-500 to-purple-600'
  }
}

function statusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'PENDING':
      return { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400' }
    case 'IN_PROGRESS':
      return { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400' }
    case 'COMPLETED':
      return { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400' }
    case 'FAILED':
      return { bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-400' }
    case 'SKIPPED':
      return { bg: 'bg-gray-100 dark:bg-gray-900/40', text: 'text-gray-700 dark:text-gray-400' }
    default:
      return { bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-400' }
  }
}

export default function UnifiedReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [queueItem, setQueueItem] = useState<any>(null)
  const [entity, setEntity] = useState<any>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [edits, setEdits] = useState<Record<string, unknown>>({})
  const [editMode, setEditMode] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/action-queue/${id}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json?.data) {
        showToast({ type: 'error', title: json?.error?.message ?? 'Failed to load review data' })
        setQueueItem(null)
        return
      }
    
      setQueueItem(json.data.queueItem)
      setEntity(json.data.entity ?? null)
      setAuditLogs(json.data.auditLogs ?? [])
    } catch (err: any) {
      showToast({ type: 'error', title: 'Failed to load review data', description: err?.message })
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const reviewComponentKey = useMemo(() => resolveReviewComponentKey(queueItem), [queueItem])
  const displayType = useMemo(() => resolveDisplayType(queueItem), [queueItem])
  const ReviewComponent = REVIEW_COMPONENT_MAP[reviewComponentKey]
  const editableFields = EDITABLE_FIELDS_MAP[reviewComponentKey] ?? []
  const entityKind = useMemo(() => {
  if (queueItem?.type === 'FIRST_OFFER_APPROVAL' || queueItem?.type === 'OFFER_REPLACEMENT') {
    return 'MERCHANT_OFFER'
  }
  return getEntityKindFromReferenceType(queueItem?.referenceType)
}, [queueItem])
  const isFinalized = queueItem?.status === 'COMPLETED' || queueItem?.status === 'FAILED'
  const canEdit = !isFinalized && (editableFields.length > 0)

  const performAction = useCallback(
    async (actionType: string, extra: Record<string, any> = {}) => {
      setProcessing(true)
      try {
        const res = await fetch(`/api/admin/action-queue/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: actionType, ...extra }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error?.message ?? 'Action failed')
        showToast({ type: 'success', title: json?.message ?? 'Action completed' })
        setEditMode(false)
        setEdits({})
        setShowRejectDialog(false)
        await loadData()
      } catch (err: any) {
        showToast({ type: 'error', title: 'Action failed', description: err?.message })
      } finally {
        setProcessing(false)
      }
    },
    [id, loadData],
  )

  const handleAddRemark = useCallback(
    async (text: string) => {
      await performAction('REMARK', { remark: text })
    },
    [performAction],
  )

  const handleApprove = useCallback(() => {
    performAction('APPROVE')
  }, [performAction])

  const handleEditAndApprove = useCallback(() => {
    const editPayload: Record<string, unknown> = {}
    for (const f of editableFields) {
      if (edits[f.key] !== undefined) {
        editPayload[f.key] = edits[f.key]
      }
    }
    if (Object.keys(editPayload).length === 0) {
      showToast({ type: 'info', title: 'No edits to apply, approving as-is' })
      performAction('APPROVE')
      return
    }
    performAction('EDIT_AND_APPROVE', { edits: editPayload })
  }, [edits, editableFields, performAction])

  const handleReject = useCallback(
    (reason: string) => {
      performAction('REJECT', { rejectionReason: reason })
    },
    [performAction],
  )

  if (loading) {
    return (
      <div className="space-y-6 py-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    )
  }

  if (!queueItem) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-red-100 dark:from-rose-950/40 dark:to-red-950/40">
          <AlertCircle className="h-8 w-8 text-rose-600" />
        </div>
        <p className="mt-4 text-lg font-semibold">Action queue item not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The item may have been removed or you may not have access to it.
        </p>
        <Link href="/admin/action-queue" className="mt-5">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back to Operations Center
          </Button>
        </Link>
      </div>
    )
  }

  const status = queueItem.status ?? 'PENDING'
  const colors = statusColor(status)
  const gradient = statusGradient(status)

  return (
    <div className="space-y-6 pb-32">
      {/* Back link */}
      <Link
        href="/admin/action-queue"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Operations Center
      </Link>

      {/* Status header banner */}
      <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-muted/30 to-muted/50 p-5`}>
        <div className={`absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${gradient} opacity-10 blur-3xl`} />
        <div className={`absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-gradient-to-br ${gradient} opacity-10 blur-2xl`} />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-md`}>
              {status === 'PENDING' ? <Clock className="h-5 w-5" /> :
                status === 'COMPLETED' ? <CheckCircle2 className="h-5 w-5" /> :
                  status === 'FAILED' ? <XCircle className="h-5 w-5" /> :
                    <FileText className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Queue Status</p>
                <Badge className={`gap-1 ${colors.bg} ${colors.text} border-0`}>
                  <span className={`relative flex h-1.5 w-1.5`}>
                    {status === 'PENDING' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />}
                    <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${status === 'PENDING' ? 'bg-amber-500' : status === 'COMPLETED' ? 'bg-emerald-500' : status === 'FAILED' ? 'bg-rose-500' : 'bg-blue-500'}`} />
                  </span>
                  {status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <p className="mt-1 text-sm font-medium">
                {status === 'PENDING' && 'Awaiting your decision'}
                {status === 'IN_PROGRESS' && 'Currently being processed'}
                {status === 'COMPLETED' && 'This item has been approved and closed'}
                {status === 'FAILED' && 'This item was rejected and closed'}
                {status === 'SKIPPED' && 'This item was skipped'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 text-xs">
              <Shield className="h-3 w-3" />
              {displayType}
            </Badge>
          </div>
        </div>
      </div>

      <ReviewHeader queueItem={queueItem} displayType={displayType} />

      {entityKind === 'MERCHANT_OFFER' && hasEntityContent(entity, entityKind) && (
        <OfferPreviewSection entity={entity} />
      )}

      {hasEntityContent(entity, entityKind) ? (
        <ReviewComponent
          entity={entity}
          queueItem={queueItem}
          edits={edits}
          setEdits={setEdits}
          editMode={editMode}
        />
      ) : (
        <EntityNotFound
          referenceId={queueItem.referenceId}
          referenceType={queueItem.referenceType}
          context={`Could not load ${entityKind.toLowerCase()} record for queue item`}
        />
      )}

      {/* {editMode && canEdit && (
        <EditFieldsForm
          fields={editableFields}
          entity={entity}
          edits={edits}
          setEdits={setEdits}
        />
      )} */}

      <RemarksPanel
        queueItem={queueItem}
        onAddRemark={handleAddRemark}
        onRefresh={loadData}
      />

      <AuditTimeline logs={auditLogs} />

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 shadow-2xl backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          {/* Left: status info */}
          <div className="flex items-center gap-2 text-sm">
            {isFinalized ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-medium">
                  Item is {queueItem.status === 'COMPLETED' ? 'approved' : 'rejected'} — read only
                </span>
              </div>
            ) : editMode ? (
              <div className="flex items-center gap-2 text-blue-600">
                <Edit3 className="h-4 w-4" />
                <span className="text-xs font-medium">Editing mode — changes will be saved on approval</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-medium">Review the details above and choose an action</span>
              </div>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* {!isFinalized && canEdit && !editMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditMode(true)}
                disabled={processing}
                className="gap-1.5"
              >
                <Edit3 className="h-4 w-4" />Edit &amp; Approve
              </Button>
            )} */}
            {!isFinalized && editMode && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditMode(false); setEdits({}) }}
                  disabled={processing}
                  className="gap-1.5"
                >
                  <XIcon className="h-4 w-4" />Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleEditAndApprove}
                  disabled={processing}
                  className="gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {processing ? 'Processing…' : 'Save & Approve'}
                </Button>
              </>
            )}
            {!isFinalized && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={processing}
                  className="gap-1.5 border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <XCircle className="h-4 w-4" />
                  {queueItem.type === 'ISSUE_REVIEW' ? 'Revise' : 'Reject'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={processing}
                  className="gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {processing ? 'Processing…' : (queueItem.type === 'ISSUE_REVIEW' ? 'Complete' : 'Approve')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <RejectDialog
        open={showRejectDialog}
        onClose={() => setShowRejectDialog(false)}
        onConfirm={handleReject}
        processing={processing}
      />
    </div>
  )
}


