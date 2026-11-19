'use client'
import { useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'
export type SortAccessors<T> = Record<string, (row: T) => string | number | Date | null | undefined>

/**
 * Client-side sorting for plain <table>s. Click cycles asc -> desc -> off.
 * Empty values always sort last.
 */
export function useTableSort<T>(rows: T[], accessors: SortAccessors<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortKey(null)
    }
  }

  const sorted = useMemo(() => {
    const get = sortKey ? accessors[sortKey] : undefined
    if (!get) return rows
    const norm = (v: unknown) => (v instanceof Date ? v.getTime() : v)
    return [...rows].sort((a, b) => {
      const va = norm(get(a))
      const vb = norm(get(b))
      const ea = va === null || va === undefined || va === ''
      const eb = vb === null || vb === undefined || vb === ''
      if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
    // accessors is expected to be a stable/module-level object or recreated cheaply
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir])

  return { sorted, sortKey, sortDir, toggleSort }
}
