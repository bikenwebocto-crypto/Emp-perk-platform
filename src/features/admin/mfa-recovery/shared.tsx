'use client'

import { Copy, History, Phone, PhoneCall } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { showToast } from '@/hooks/use-toast'
import { cn } from '@/utils/cn'

// Shared by the Super Admin review page (/admin/mfa-recovery), the recovery
// approver inbox (/admin/recovery-approvals) and the approver settings page.

export type RecoveryStatus =
  | 'PENDING' | 'UNDER_REVIEW' | 'OTP_SENT' | 'OTP_VERIFIED' | 'APPROVED' | 'MFA_RESET'
  | 'AWAITING_NEW_MFA' | 'COMPLETED' | 'REJECTED' | 'EXPIRED' | 'FAILED'

export const STATUS_LABELS: Record<RecoveryStatus, string> = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under review',
  OTP_SENT: 'Email OTP sent',
  OTP_VERIFIED: 'OTP verified',
  APPROVED: 'Approved',
  MFA_RESET: 'MFA reset',
  AWAITING_NEW_MFA: 'Awaiting new MFA',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  FAILED: 'Failed',
}

const STATUS_STYLES: Record<RecoveryStatus, string> = {
  PENDING: 'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-amber-100 text-amber-800',
  OTP_SENT: 'bg-amber-100 text-amber-800',
  OTP_VERIFIED: 'bg-indigo-100 text-indigo-800',
  APPROVED: 'bg-indigo-100 text-indigo-800',
  MFA_RESET: 'bg-indigo-100 text-indigo-800',
  AWAITING_NEW_MFA: 'bg-purple-100 text-purple-800',
  COMPLETED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-100 text-gray-700',
  FAILED: 'bg-red-100 text-red-800',
}

// Statuses where the next change comes from the user (OTP entry, new MFA
// enrolment) or a background step, not from the admin viewing the page. The
// admin views poll while a request sits in one of these so the status moves
// on (e.g. "Email OTP sent" -> "OTP verified" -> "Completed") without a reload.
export const USER_PENDING_STATUSES: RecoveryStatus[] = ['OTP_SENT', 'APPROVED', 'MFA_RESET', 'AWAITING_NEW_MFA']
export const DETAIL_POLL_MS = 5_000
export const LIST_POLL_MS = 15_000

export function isUserPending(status: RecoveryStatus | undefined) {
  return !!status && USER_PENDING_STATUSES.includes(status)
}

export const ROLE_LABELS: Record<string, string> = {
  MERCHANT: 'Merchant',
  COMPANY_ADMIN: 'Company Admin',
  SUPER_ADMIN: 'Admin',
}

export type OtpState = 'VERIFIED' | 'LOCKED' | 'REPLACED' | 'EXPIRED' | 'AWAITING_USER'

export const OTP_STATE_COPY: Record<OtpState, { label: string; className: string }> = {
  AWAITING_USER: { label: 'Sent, waiting for the user to enter it', className: 'text-amber-700' },
  VERIFIED: { label: 'Verified by the user', className: 'text-green-700' },
  EXPIRED: { label: 'Expired before use', className: 'text-gray-600' },
  LOCKED: { label: 'Locked after too many wrong attempts', className: 'text-red-700' },
  REPLACED: { label: 'Replaced by a newer code', className: 'text-gray-600' },
}

const HISTORY_LABELS: Record<string, string> = {
  REQUEST_CREATED: 'Request submitted',
  REVIEW_STARTED: 'Marked under review',
  CONTACT_ATTEMPTED: 'User contacted by phone',
  OTP_SENT: 'Email OTP sent',
  OTP_RESENT: 'Email OTP resent',
  OTP_EMAIL_FAILED: 'OTP email failed to send',
  OTP_FAILED: 'Wrong OTP entered',
  OTP_LOCKED: 'OTP locked',
  OTP_VERIFIED: 'OTP verified by user',
  APPROVER_NOTIFIED: 'Recovery approver notified',
  APPROVED: 'MFA reset approved',
  EMERGENCY_APPROVED: 'Emergency MFA reset approved',
  FACTOR_REMOVAL_FAILED: 'Authenticator removal failed',
  MFA_RESET: 'Old authenticator removed',
  AWAITING_NEW_MFA: 'Waiting for new authenticator',
  COMPLETED: 'New authenticator registered',
  REJECTED: 'Request rejected',
  EMERGENCY_REJECTED: 'Emergency request rejected',
  REQUEST_EXPIRED: 'Request expired',
}

export interface RecoveryRow {
  id: string
  recoveryType: 'STANDARD' | 'SUPER_ADMIN_EMERGENCY'
  status: RecoveryStatus
  accountId: string
  accountRole: string
  displayName: string | null
  registeredEmail: string
  registeredPhone: string | null
  requestedAt: string
  otpSentAt: string | null
  otpVerifiedAt: string | null
}

export interface RecoveryDetail extends RecoveryRow {
  reason: string
  otpSendCount: number
  expiresAt: string
  approvedAt: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  resetAt: string | null
  resetError: string | null
  completedAt: string | null
  otp: {
    sentAt: string
    expiresAt: string
    attempts: number
    maxAttempts: number
    verifiedAt: string | null
    state: OtpState
  } | null
}

export interface HistoryEntry {
  id: string
  action: string
  actorRole: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface RecoveryListResponse {
  items: RecoveryRow[]
  summary: { total: number; pending: number; underReview: number; completed: number; rejected: number }
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

/** fetch + unwrap `{ success, data }`, turning API errors into readable messages. */
export async function recoveryApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) {
    const err = json.error ?? {}
    const extra = err.retryAfterSeconds ? ` Try again in ${err.retryAfterSeconds}s.` : ''
    throw Object.assign(new Error((err.message ?? 'Request failed') + extra), { code: err.code as string | undefined })
  }
  return json.data as T
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function shortId(id: string) {
  return id.slice(0, 8).toUpperCase()
}

export async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast({ type: 'success', title: `${label} copied` })
  } catch {
    showToast({ type: 'error', title: `Could not copy ${label.toLowerCase()}` })
  }
}

export function StatusBadge({ status }: { status: RecoveryStatus }) {
  return (
    <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLES[status])}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

/** Highlighted registered number with Call and Copy actions. */
export function ContactNumber({ phone, compact = false }: { phone: string | null; compact?: boolean }) {
  if (!phone) return <span className="text-xs text-muted-foreground">No number on file</span>
  return (
    <div className={cn('flex items-center gap-1', compact ? 'flex-nowrap' : 'flex-wrap gap-2')}>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-medium text-primary">
        <Phone className="h-3.5 w-3.5" />
        {phone}
      </span>
      <Button asChild variant="ghost" size="sm" className="h-7 px-2" title="Call" onClick={(e) => e.stopPropagation()}>
        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
          <PhoneCall className="h-3.5 w-3.5" />
          {!compact && <span className="ml-1">Call</span>}
        </a>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        title="Copy number"
        onClick={(e) => { e.stopPropagation(); void copyToClipboard(phone, 'Number') }}
      >
        <Copy className="h-3.5 w-3.5" />
        {!compact && <span className="ml-1">Copy number</span>}
      </Button>
    </div>
  )
}

export function Section({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {title}
      </h3>
      {children}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 break-words">{children}</dd>
    </div>
  )
}

export function OtpStatusSection({ detail }: { detail: RecoveryDetail }) {
  return (
    <>
      {detail.otp ? (
        <dl className="space-y-1.5">
          <Field label="State">
            <span className={cn('font-medium', OTP_STATE_COPY[detail.otp.state].className)}>
              {OTP_STATE_COPY[detail.otp.state].label}
            </span>
          </Field>
          <Field label="Last sent">{formatDate(detail.otp.sentAt)}</Field>
          <Field label="Code expires">{formatDate(detail.otp.expiresAt)}</Field>
          <Field label="Attempts">{detail.otp.attempts} / {detail.otp.maxAttempts}</Field>
          <Field label="Codes sent">{detail.otpSendCount}</Field>
          {detail.otpVerifiedAt && <Field label="Verified at">{formatDate(detail.otpVerifiedAt)}</Field>}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">No code sent yet.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Codes go only to the registered email and are never shown to admins or approvers.
      </p>
    </>
  )
}

export function HistoryTimeline({ entries, isLoading }: { entries: HistoryEntry[] | undefined; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-20 w-full" />
  if (!entries?.length) return <p className="text-sm text-muted-foreground">No history yet.</p>
  return (
    <ol className="space-y-3 border-l pl-4">
      {entries.map((h) => (
        <li key={h.id} className="relative text-sm">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
          <div className="font-medium">{HISTORY_LABELS[h.action] ?? h.action}</div>
          <div className="text-xs text-muted-foreground">
            {formatDate(h.createdAt)} · {h.actorRole === 'SYSTEM' ? 'System' : h.actorRole.replace('SUPER_ADMIN:', 'Admin ')}
          </div>
          {typeof h.metadata?.note === 'string' && <div className="text-xs">Note: {h.metadata.note}</div>}
          {typeof h.metadata?.reason === 'string' && <div className="text-xs">Reason: {h.metadata.reason}</div>}
        </li>
      ))}
    </ol>
  )
}

export { History as HistoryIcon }
