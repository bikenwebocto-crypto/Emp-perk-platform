'use client'
import { useState } from 'react'
import Link from 'next/link'
import {
  Eye,
  Pencil,
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
import { showToast } from '@/hooks/use-toast'
import type { MerchantDashboardRow } from '@/types'

interface MerchantActionsMenuProps {
  row: MerchantDashboardRow
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onDelete?: (id: string) => void
  onSuspend?: (id: string) => void
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
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [customPriority, setCustomPriority] = useState(String(row.displayPriority ?? 0))

  const isPending = row.status === 'PENDING'
  const isActive = row.status === 'ACTIVE'
  const isSuspended = row.status === 'SUSPENDED'
  const isPaused = row.status === 'PAUSED'

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
      onClick={() => onSuspend?.(row.id)}
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

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete?.(row.id)}
            className="flex items-center gap-2 text-rose-600"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
