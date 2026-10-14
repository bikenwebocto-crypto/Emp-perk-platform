'use client'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'

const statusStyles: Record<string, string> = {
  // Action queue
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-500',
  // Merchant / Company / Employee
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500',
  INACTIVE: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-500',
  SUSPENDED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500',
  // Offer
  LIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500',
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-500',
  VALIDATION_IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500',
  AWAITING_APPROVAL: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500',
  VALIDATION_FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500',
  EXPIRED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-500',
  ARCHIVED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-500',
  // CSV
  UPLOADED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500',
  PROCESSING: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-500',
  COMPLETED_CSV: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500',
  ERROR: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500',
  // Lead
  NEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500',
  CONTACTED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500',
  CONVERTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500',
  // Generic
  INVITED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500',
  VERIFIED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500',
  URGENT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500',
}

interface StatusBadgeProps {
  status: string
  label?: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = statusStyles[status] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-500'
  return (
    <Badge variant="outline" className={cn('border-transparent', style)}>
      {label ?? status.replace(/_/g, ' ')}
    </Badge>
  )
}
