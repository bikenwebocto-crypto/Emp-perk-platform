'use client'

import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface DetailRowProps {
  label: string
  children: ReactNode
  className?: string
}

/** Label/value row used by the banner detail cards. */
export function DetailRow({ label, children, className }: DetailRowProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0',
        className,
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  )
}

export function DetailRowList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border">{children}</div>
}
