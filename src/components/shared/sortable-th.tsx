'use client'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { SortDir } from '@/hooks/use-table-sort'

interface SortableThProps {
  label: React.ReactNode
  sortKey: string
  activeKey: string | null
  dir: SortDir
  onSort: (key: string) => void
  className?: string
  align?: 'left' | 'right'
}

export function SortableTh({ label, sortKey, activeKey, dir, onSort, className, align = 'left' }: SortableThProps) {
  const active = activeKey === sortKey
  return (
    <th
      className={cn('cursor-pointer select-none hover:text-foreground', className)}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={cn('inline-flex items-center', align === 'right' && 'justify-end w-full')}>
        {label}
        {active && dir === 'asc' && <ChevronUp className="ml-1 h-3 w-3 shrink-0" />}
        {active && dir === 'desc' && <ChevronDown className="ml-1 h-3 w-3 shrink-0" />}
        {!active && <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />}
      </span>
    </th>
  )
}
