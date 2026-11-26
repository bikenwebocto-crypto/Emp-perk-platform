'use client'

import { useQuery } from '@tanstack/react-query'

export type ChangeRequest = {
  id: string
  kind: 'PROFILE' | 'BRANCH_LOCATION'
  branchName: string | null
  fields: string[]
  reason: string | null
  requestedValues: { businessName?: string | null; categoryId?: string | null; logoUrl?: string | null }
  requestedCategoryName: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejectionReason: string | null
  createdAt: string
  decidedAt: string | null
}

async function fetchChangeRequests(): Promise<ChangeRequest[]> {
  const res = await fetch('/api/merchant/change-requests')
  const json = await res.json()
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Failed to load change requests')
  return json.data
}

/**
 * The merchant's profile change requests (newest first), reduced to what the
 * profile page shows: the open request (inline "Requested: …" hints) and the
 * latest decided one (Approved / Not approved banner).
 */
export function useMerchantChangeRequests() {
  const { data } = useQuery({
    queryKey: ['merchant-change-requests'],
    queryFn: fetchChangeRequests,
  })
  const profileRequests = (data ?? []).filter((r) => r.kind === 'PROFILE')
  const pending = profileRequests.find((r) => r.status === 'PENDING') ?? null
  const latestDecided = profileRequests.find((r) => r.status !== 'PENDING') ?? null
  // Only show an outcome that is newer than any open request.
  const showOutcome =
    latestDecided && (!pending || new Date(latestDecided.createdAt) > new Date(pending.createdAt))
      ? latestDecided
      : null
  return { pending, latestDecided: showOutcome, recent: profileRequests.slice(0, 4) }
}

const FIELD_LABELS: Record<string, string> = {
  businessName: 'business name',
  categoryId: 'category',
  logoUrl: 'logo',
}

/** Last few profile requests, newest first, as Pending / Approved / Not approved banners. */
export function ChangeRequestHistory({ requests }: { requests: ChangeRequest[] }) {
  if (!requests.length) return null
  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <ChangeRequestOutcomeBanner key={r.id} request={r} />
      ))}
    </div>
  )
}

export function RequestedHint({ text }: { text: string }) {
  return <p className="mt-1 text-xs text-muted-foreground">Requested: {text}</p>
}

export function ChangeRequestOutcomeBanner({ request }: { request: ChangeRequest | null }) {
  if (!request) return null
  const style = {
    APPROVED:
      'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    REJECTED:
      'border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
    PENDING:
      'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  }[request.status]
  const title = { APPROVED: 'Approved', REJECTED: 'Not approved', PENDING: 'Pending review' }[request.status]
  const fields = request.fields.map((f) => FIELD_LABELS[f] ?? f).join(', ')
  const body =
    request.status === 'APPROVED'
      ? 'Your profile update has been approved and is now live.'
      : request.status === 'REJECTED'
        ? `Reason: ${request.rejectionReason ?? 'No reason given.'}`
        : `Your requested change${fields ? ` to ${fields}` : ''} is waiting for review.`
  return (
    <div className={`rounded-lg border px-4 py-3 ${style}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs opacity-75">{new Date(request.createdAt).toLocaleDateString()}</p>
      </div>
      <p className="text-sm">{body}</p>
    </div>
  )
}
