'use client'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ApproveConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  processing: boolean
  /** LIVE Evergreen offer that will be deactivated by this approval, if any. */
  replacedEvergreen?: { id: string; title: string } | null
}

export function ApproveConfirmDialog({
  open,
  onClose,
  onConfirm,
  processing,
  replacedEvergreen,
}: ApproveConfirmDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={processing ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold">Approve this item?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Do you want to proceed with the approval?
            </p>
          </div>
        </div>

        {replacedEvergreen && (
          <div className="mt-4 flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This merchant already has a LIVE Evergreen offer: <strong>{replacedEvergreen.title}</strong>.
              Approving will make it inactive, and this offer will go LIVE instead.
            </span>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={processing}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={processing}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
          >
            {processing ? 'Processing…' : 'Proceed'}
          </Button>
        </div>
      </div>
    </div>
  )
}
