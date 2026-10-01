import type { ComplaintPriority } from '@prisma/client'

export const COMPLAINT_TYPE_PRIORITY_MAP: Record<string, ComplaintPriority> = {
  MISLEADING: 'HIGH',
  POLICY_VIOLATION: 'HIGH',
  INVALID_TERMS: 'MEDIUM',
  NON_FUNCTIONAL: 'MEDIUM',
}

export function getPriorityForType(complaintType: string): ComplaintPriority {
  return COMPLAINT_TYPE_PRIORITY_MAP[complaintType] ?? 'MEDIUM'
}

export const APPLICATION_SUPPORT_CATEGORIES = [
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'ACCOUNT', label: 'Account' },
  { value: 'OTHER', label: 'Other' },
] as const

export const CATEGORY_PRIORITY_MAP: Record<string, string> = {
  TECHNICAL: 'HIGH',
  ACCOUNT: 'HIGH',
  OTHER: 'LOW',
}

export function getPriorityForCategory(category: string | null | undefined): string {
  return CATEGORY_PRIORITY_MAP[category ?? 'OTHER'] ?? 'LOW'
}

export const PRIORITY_STYLES: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500',
  MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500',
  LOW: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-500',
}

export const PRIORITY_BADGE_CLASS = 'rounded-full px-2 py-0.5 text-xs font-medium'
