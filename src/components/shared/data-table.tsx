'use client'
import { useState, useCallback, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type RowSelectionState,
  type ColumnDef as TanStackColumnDef,
} from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import type { ColumnDef, TableSortConfig } from '@/types'
import { Button } from '../ui/button'

interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  isLoading?: boolean
  emptyMessage?: string
  emptyAction?: React.ReactNode
  sortable?: boolean
  sortConfig?: TableSortConfig
  onSort?: (config: TableSortConfig) => void
  onRowClick?: (row: T) => void
  selectable?: boolean
  selectedIds?: Set<string>
  onSelectChange?: (ids: Set<string>) => void
  pagination?: {
    page: number
    pageSize: number
    total: number
    onPageChange: (page: number) => void
  }
}

interface TanStackMeta {
  align?: 'left' | 'center' | 'right'
}

function toTanStackCols<T>(columns: ColumnDef<T>[], selectable: boolean, onRowClick?: (row: T) => void): TanStackColumnDef<T>[] {
  const result: TanStackColumnDef<T>[] = []

  if (selectable) {
    result.push({
      id: '__select__',
      header: '',
      enableSorting: false,
      size: 40,
      meta: { align: undefined } as TanStackMeta,
    })
  }

  for (const col of columns) {
    result.push({
      id: col.key,
      accessorFn: (row: T) => (col.sortValue ? col.sortValue(row) : (row as Record<string, unknown>)[col.key]) as any,
      header: col.header,
      enableSorting: col.sortable !== false && col.header !== '',
      sortUndefined: 'last',
      size: col.width ? parseInt(col.width) : undefined,
      cell: col.render ? (info) => col.render!(info.row.original) : undefined,
      meta: { align: col.align } as TanStackMeta,
    })
  }

  return result
}

export function DataTable<T extends Record<string, unknown>>({
  columns: rawColumns,
  data,
  keyExtractor,
  isLoading,
  emptyMessage = 'No data found',
  emptyAction,
  sortable = true,
  sortConfig,
  onSort,
  onRowClick,
  selectable = false,
  selectedIds,
  onSelectChange,
  pagination,
}: DataTableProps<T>) {
  const [localSorting, setLocalSorting] = useState<SortingState>([])
  const isExternallySorted = sortConfig !== undefined && onSort !== undefined
  const sorting: SortingState = isExternallySorted
    ? [{ id: sortConfig!.key, desc: sortConfig!.direction === 'desc' }]
    : localSorting

  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      if (isExternallySorted) {
        const sort = next[0]
        onSort?.({
          key: sort?.id ?? '',
          direction: sort ? (sort.desc ? 'desc' : 'asc') : 'asc',
        })
      } else {
        setLocalSorting(next)
      }
    },
    [sorting, isExternallySorted, onSort],
  )

  const rowSelection = useMemo(() => {
    if (!selectable || !selectedIds) return {}
    const sel: RowSelectionState = {}
    for (const row of data) {
      const id = keyExtractor(row)
      if (selectedIds.has(id)) sel[id] = true
    }
    return sel
  }, [selectable, selectedIds, data, keyExtractor])

  const handleRowSelectionChange = useCallback(
    (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater
      onSelectChange?.(new Set(Object.keys(next).filter((k) => next[k])))
    },
    [rowSelection, onSelectChange],
  )

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1

  const columns = useMemo(() => toTanStackCols(rawColumns, selectable, onRowClick), [rawColumns, selectable, onRowClick])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // Server sorts when the parent controls sorting; otherwise sort the loaded rows client-side.
    getSortedRowModel: isExternallySorted ? undefined : getSortedRowModel(),
    manualSorting: isExternallySorted,
    manualPagination: true,
    enableRowSelection: selectable,
    enableSorting: sortable,
    getRowId: (row) => keyExtractor(row),
    state: {
      sorting,
      rowSelection,
      pagination: pagination
        ? { pageIndex: pagination.page - 1, pageSize: pagination.pageSize }
        : undefined,
    },
    onSortingChange: handleSortingChange,
    onRowSelectionChange: handleRowSelectionChange,
    pageCount: pagination ? totalPages : undefined,
  })

  if (isLoading) {
    const skeletonCols = selectable ? rawColumns.length + 1 : rawColumns.length
    return (
      <div className="space-y-3">
        <div className="flex gap-4">
          {selectable && <Skeleton className="h-8 w-10 shrink-0" />}
          {rawColumns.map((_, i) => (
            <Skeleton key={i} className="h-8 flex-1" />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        {emptyAction && <div className="mt-3">{emptyAction}</div>}
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b text-left text-muted-foreground">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as TanStackMeta | undefined
                  const isSelectCol = header.column.id === '__select__'
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'pb-3 font-medium',
                        !isSelectCol &&
                          header.column.getCanSort() &&
                          sortable &&
                          'cursor-pointer select-none hover:text-foreground',
                        meta?.align === 'right' && 'text-right',
                        meta?.align === 'center' && 'text-center',
                      )}
                      style={{
                        width: header.getSize() !== 150 ? header.getSize() : undefined,
                      }}
                      onClick={
                        isSelectCol
                          ? undefined
                          : header.column.getToggleSortingHandler()
                      }
                    >
                      {isSelectCol ? (
                        <Checkbox
                          checked={
                            table.getIsAllRowsSelected() ||
                            (table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected())
                          }
                          indeterminate={
                            table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
                          }
                          onCheckedChange={() => table.toggleAllRowsSelected()}
                        />
                      ) : (
                        <span className="inline-flex items-center">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && sortable && (
                            <>
                              {header.column.getIsSorted() === 'asc' && <ChevronUp className="ml-1 h-3 w-3 shrink-0" />}
                              {header.column.getIsSorted() === 'desc' && <ChevronDown className="ml-1 h-3 w-3 shrink-0" />}
                              {!header.column.getIsSorted() && <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />}
                            </>
                          )}
                        </span>
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  'border-b transition-colors last:border-0 hover:bg-muted/50',
                  onRowClick && 'cursor-pointer',
                  row.getIsSelected() && 'bg-muted/30',
                )}
                onClick={() => onRowClick?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as TanStackMeta | undefined
                  const isSelectCol = cell.column.id === '__select__'
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        'py-3',
                        meta?.align === 'right' && 'text-right',
                        meta?.align === 'center' && 'text-center',
                      )}
                      onClick={(e) => isSelectCol && e.stopPropagation()}
                    >
                      {isSelectCol ? (
                        <Checkbox
                          checked={row.getIsSelected()}
                          onCheckedChange={() => row.toggleSelected()}
                        />
                      ) : (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {pagination.total === 0
              ? '0 records'
              : `${(pagination.page - 1) * pagination.pageSize + 1}-${Math.min(pagination.page * pagination.pageSize, pagination.total)} of ${pagination.total} records`}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || pagination.page <= 1}
              onClick={() => pagination.onPageChange(1)}
              aria-label="First page"
              title="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              aria-label="Previous page"
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-xs text-muted-foreground">
              Page {pagination.page} of {Math.max(1, totalPages)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              aria-label="Next page"
              title="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(totalPages)}
              aria-label="Last page"
              title="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
