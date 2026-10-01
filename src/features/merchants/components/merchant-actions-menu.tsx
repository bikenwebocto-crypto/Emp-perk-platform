'use client'
import { useState } from 'react'
import Link from 'next/link'
import {
  Eye,
  Pencil,
  Star,
  Home,
  Trash2,
  MoreHorizontal,
  Ban,
  CheckCircle2,
  Pause,
  TrendingUp,
  TrendingDown,
  Check,
  X,
  AlertCircle,
  Heart,
  Activity,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { showToast } from '@/hooks/use-toast'
import type { MerchantDashboardRow } from '@/types'

interface MerchantActionsMenuProps {
  row: MerchantDashboardRow
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onDelete?: (id: string) => void
  onSuspend?: (id: string, reason: string) => void
  onActivate?: (id: string) => void
  onPause?: (id: string) => void
  onResume?: (id: string) => void
  onToggleFeatured?: (id: string, value: boolean) => void
  onToggleHomepage?: (id: string, value: boolean) => void
  onChangePriority?: (id: string, value: number) => void
  disabled?: boolean
}

const PRIORITY_PRESETS = [0, 5, 10, 25, 50, 100]

export function MerchantActionsMenu({
  row,
  onApprove,
  onReject,
  onDelete,
  onSuspend,
  onActivate,
  onPause,
  onResume,
  onToggleFeatured,
  onToggleHomepage,
  onChangePriority,
  disabled,
}: MerchantActionsMenuProps) {
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [customPriority, setCustomPriority] = useState(String(row.displayPriority ?? 0))

  const isPending = row.status === 'PENDING'
  const isActive = row.status === 'ACTIVE'
  const isSuspended = row.status === 'SUSPENDED'
  const isPaused = row.status === 'PAUSED'

  const handleSuspend = () => {
    if (!suspendReason.trim()) {
      showToast({ type: 'error', title: 'Required', description: 'Please provide a reason' })
      return
    }
    onSuspend?.(row.id, suspendReason.trim())
    setSuspendOpen(false)
    setSuspendReason('')
  }

  const handlePriorityPreset = (value: number) => {
    onChangePriority?.(row.id, value)
    setPriorityOpen(false)
  }

  const handleCustomPriority = () => {
    const num = parseInt(customPriority)
    if (Number.isNaN(num) || num < 0) {
      showToast({ type: 'error', title: 'Invalid', description: 'Priority must be a non-negative number' })
      return
    }
    onChangePriority?.(row.id, num)
    setPriorityOpen(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={disabled}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs">Quick actions</DropdownMenuLabel>

          <DropdownMenuItem asChild>
            <Link href={`/admin/merchants/${row.id}`} className="flex items-center gap-2">
              <Eye className="h-4 w-4" /> View details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/admin/merchants/${row.id}/edit`} className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edit merchant
            </Link>
          </DropdownMenuItem>

          {isPending && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onApprove?.(row.id)}
                className="flex items-center gap-2 text-emerald-600"
              >
                <Check className="h-4 w-4" /> Approve
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onReject?.(row.id)}
                className="flex items-center gap-2 text-rose-600"
              >
                <X className="h-4 w-4" /> Reject
              </DropdownMenuItem>
            </>
          )}

          {isActive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onPause?.(row.id)}
                className="flex items-center gap-2"
              >
                <Pause className="h-4 w-4" /> Pause
              </DropdownMenuItem>
            </>
          )}



{isPaused && (
  <>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      onClick={() => onResume?.(row.id)}
      className="flex items-center gap-2 text-emerald-600"
    >
      <CheckCircle2 className="h-4 w-4" /> Resume
    </DropdownMenuItem>
    <DropdownMenuItem
      onClick={() => setSuspendOpen(true)}
      className="flex items-center gap-2 text-rose-600"
    >
      <Ban className="h-4 w-4" /> Suspend
    </DropdownMenuItem>
  </>
)}

{isSuspended && (
  <DropdownMenuItem
    onClick={() => onActivate?.(row.id)}
    className="flex items-center gap-2 text-emerald-600"
  >
    <CheckCircle2 className="h-4 w-4" /> Reactivate
  </DropdownMenuItem>
)}

          {isSuspended && (
            <DropdownMenuItem
              onClick={() => onActivate?.(row.id)}
              className="flex items-center gap-2 text-emerald-600"
            >
              <CheckCircle2 className="h-4 w-4" /> Reactivate
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Display</DropdownMenuLabel>

          <DropdownMenuItem
            onClick={() => onToggleFeatured?.(row.id, !row.isFeatured)}
            className="flex items-center gap-2"
          >
            <Star className={`h-4 w-4 ${row.isFeatured ? 'fill-yellow-400 text-yellow-500' : ''}`} />
            {row.isFeatured ? 'Unfeature' : 'Mark Featured'}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => onToggleHomepage?.(row.id, !row.isHomepageMerchant)}
            className="flex items-center gap-2"
          >
            <Home className={`h-4 w-4 ${row.isHomepageMerchant ? 'fill-pink-400 text-pink-500' : ''}`} />
            {row.isHomepageMerchant ? 'Remove from Homepage' : 'Add to Homepage'}
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>Priority: {row.displayPriority}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuLabel className="text-xs">Quick set</DropdownMenuLabel>
                {PRIORITY_PRESETS.map((p) => (
                  <DropdownMenuItem key={p} onClick={() => handlePriorityPreset(p)}>
                    {p === 0 ? 'Reset to 0' : `Set to ${p}`}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Custom value</DropdownMenuLabel>
                <div className="flex items-center gap-1 p-2">
                  <input
                    type="number"
                    min={0}
                    value={customPriority}
                    onChange={(e) => setCustomPriority(e.target.value)}
                    className="h-7 w-20 rounded border bg-background px-2 text-xs"
                  />
                  <Button size="sm" variant="outline" onClick={handleCustomPriority} className="h-7 text-xs">
                    Set
                  </Button>
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete?.(row.id)}
            className="flex items-center gap-2 text-rose-600"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-600" />
              Suspend {row.businessName}?
            </DialogTitle>
            <DialogDescription>
              This will hide the merchant from employees and prevent redemptions. You can
              reactivate them later from the same menu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason for suspension</label>
            <Textarea
              placeholder="e.g. Policy violation, multiple complaints, payment failure..."
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSuspend}
              className="gap-1.5"
            >
              <Ban className="h-4 w-4" /> Suspend merchant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
