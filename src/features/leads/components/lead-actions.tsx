'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneCall, XCircle, ArrowRightCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useUpdateLeadStatus, type Lead } from '@/hooks/queries/use-leads'
import { showToast } from '@/hooks/use-toast'
import { convertHref } from '@/lib/leads/prefill'

type PendingAction = 'CONTACTED' | 'REJECTED' | null

export function LeadActions({ lead, compact = false }: { lead: Pick<Lead, 'id' | 'type' | 'status'>; compact?: boolean }) {
  const router = useRouter()
  const updateStatus = useUpdateLeadStatus()
  const [pending, setPending] = useState<PendingAction>(null)
  const [reason, setReason] = useState('')

  const canChangeStatus = lead.status === 'NEW'
  const canConvert = lead.status !== 'CONVERTED' && lead.status !== 'REJECTED'
  if (!canChangeStatus && !canConvert) return null

  const close = () => { setPending(null); setReason('') }

  const confirm = () => {
    if (!pending) return
    if (pending === 'REJECTED' && !reason.trim()) {
      showToast({ type: 'error', title: 'A reason is required to reject a lead' })
      return
    }
    updateStatus.mutate(
      { id: lead.id, status: pending, note: reason.trim() || undefined },
      {
        onSuccess: (res: { message?: string }) => {
          showToast({ type: 'success', title: res.message ?? 'Lead updated' })
          close()
        },
        onError: (err: Error) => {
          showToast({ type: 'error', title: 'Lead update failed', description: err.message })
          close()
        },
      },
    )
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className="flex items-center gap-1.5" onClick={stop}>
      {canChangeStatus && (
        <Button
          variant="outline"
          size="sm"
          className={`h-8 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/50 ${compact ? 'w-8 p-0' : ''}`}
          title="Mark contacted"
          onClick={() => setPending('CONTACTED')}
        >
          <PhoneCall className="h-3.5 w-3.5" />{!compact && ' Mark contacted'}
        </Button>
      )}
      {canChangeStatus && (
        <Button
          variant="outline"
          size="sm"
          className={`h-8 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50 ${compact ? 'w-8 p-0' : ''}`}
          title="Reject"
          onClick={() => setPending('REJECTED')}
        >
          <XCircle className="h-3.5 w-3.5" />{!compact && ' Reject'}
        </Button>
      )}
      {canConvert && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/50"
          title="Convert"
          onClick={() => router.push(convertHref(lead))}
        >
          <ArrowRightCircle className="h-3.5 w-3.5" /> Convert
        </Button>
      )}
      <ConfirmDialog
        open={pending !== null}
        title={pending === 'REJECTED' ? 'Reject lead' : 'Mark as contacted'}
        message={pending === 'REJECTED' ? 'Why is this lead being rejected? The reason is kept in the audit log.' : 'Mark this lead as contacted?'}
        confirmLabel={pending === 'REJECTED' ? 'Reject' : 'Mark contacted'}
        variant={pending === 'REJECTED' ? 'destructive' : 'default'}
        loading={updateStatus.isPending}
        onConfirm={confirm}
        onCancel={close}
      >
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          placeholder={pending === 'REJECTED' ? 'Reason (required)' : 'Internal note (optional)'}
        />
      </ConfirmDialog>
    </div>
  )
}
