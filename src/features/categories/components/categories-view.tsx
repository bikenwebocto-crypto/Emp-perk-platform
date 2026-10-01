'use client'
import { useMemo, useState } from 'react'
import { Pencil, Plus, Search, Tags, Trash2, X } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { showToast } from '@/hooks/use-toast'
import { useAdminCategories, useDeleteCategory } from '@/hooks/queries/use-admin-categories'
import type { AdminCategoryRow } from '../types'
import { CategoryFormDialog } from './category-form-dialog'
import { CategoryMerchantsDialog } from './category-merchants-dialog'

function CategoryLogo({ category, className = 'h-10 w-10' }: { category: AdminCategoryRow; className?: string }) {
  if (category.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={category.logoUrl}
        alt=""
        className={`${className} shrink-0 rounded-lg border bg-background object-contain p-1`}
      />
    )
  }
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-lg border bg-muted text-sm font-bold text-muted-foreground`}
      title={category.icon ? `Icon: ${category.icon}` : 'No logo'}
    >
      {category.name.charAt(0).toUpperCase()}
    </div>
  )
}

function MerchantsCell({ category, onViewAll }: { category: AdminCategoryRow; onViewAll: () => void }) {
  if (category.merchantCount === 0) {
    return <span className="text-xs text-muted-foreground">No merchants</span>
  }
  const shown = category.merchants
  const more = category.merchantCount - shown.length
  return (
    <button type="button" onClick={onViewAll} className="group flex items-center gap-2 text-left">
      <div className="flex -space-x-2">
        {shown.slice(0, 4).map((m) => (
          <Avatar key={m.id} className="h-7 w-7 border-2 border-card" title={m.businessName}>
            {m.logoUrl ? <AvatarImage src={m.logoUrl} alt="" /> : null}
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-[10px] font-bold text-white">
              {m.businessName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span className="text-xs">
        <span className="font-semibold tabular-nums">{category.merchantCount}</span>{' '}
        merchant{category.merchantCount === 1 ? '' : 's'}
        <span className="block max-w-[220px] truncate text-muted-foreground group-hover:text-primary group-hover:underline">
          {shown.map((m) => m.businessName).join(', ')}
          {more > 0 ? ` +${more} more` : ''}
        </span>
      </span>
    </button>
  )
}

function RowActions({
  category,
  onEdit,
  onDelete,
  disabled,
}: {
  category: AdminCategoryRow
  onEdit: () => void
  onDelete: () => void
  disabled?: boolean
}) {
  const inUse = category.merchantCount > 0
  const reason = inUse
    ? `Linked to ${category.merchantCount} merchant${category.merchantCount === 1 ? '' : 's'}. Move them to another category before deleting.`
    : 'Delete category'
  return (
    <div className="inline-flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Edit category" title="Edit category">
        <Pencil className="h-4 w-4" />
      </Button>
      {/* Wrapper carries the tooltip because disabled buttons don't receive hover events. */}
      <span title={reason} className="inline-flex">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
          disabled={inUse || disabled}
          aria-label={reason}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </span>
    </div>
  )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="live" className="text-[10px]">Active</Badge>
  ) : (
    <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
  )
}

const th = 'px-3 pb-3 pt-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground'

export function CategoriesView() {
  const [search, setSearch] = useState('')
  // undefined = closed, null = add, row = edit
  const [formTarget, setFormTarget] = useState<AdminCategoryRow | null | undefined>(undefined)
  const [viewing, setViewing] = useState<AdminCategoryRow | null>(null)
  const [deleting, setDeleting] = useState<AdminCategoryRow | null>(null)

  const { data, isLoading, isError, error } = useAdminCategories()
  const deleteMutation = useDeleteCategory()

  const categories = useMemo(() => data ?? [], [data])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return categories
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.includes(q) || c.description?.toLowerCase().includes(q),
    )
  }, [categories, search])

  const inUseCount = categories.filter((c) => c.merchantCount > 0).length

  const handleConfirmDelete = () => {
    if (!deleting) return
    deleteMutation.mutate(deleting.id, {
      onSuccess: () => showToast({ type: 'success', title: 'Category deleted', description: deleting.name }),
      onError: (err: Error) => showToast({ type: 'error', title: 'Could not delete category', description: err.message }),
      onSettled: () => setDeleting(null),
    })
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Categories"
        description="Create and edit merchant categories. A category can only be deleted when no merchants use it."
        actions={(
          <Button className="gap-1.5" onClick={() => setFormTarget(null)}>
            <Plus className="h-4 w-4" /> Add Category
          </Button>
        )}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 pr-8"
          />
          {search && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {data && (
          <p className="text-xs text-muted-foreground">
            {categories.length} categories · {inUseCount} in use · {categories.length - inUseCount} empty
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Tags className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">{search ? 'No categories match your search' : 'No categories yet'}</p>
        </div>
      ) : (
        <>
          {/* md+ table */}
          <div className="hidden overflow-x-auto rounded-lg border bg-card shadow-sm [scrollbar-width:thin] md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className={`${th} w-16`}>Logo</th>
                  <th className={th}>Category</th>
                  <th className={th}>Merchants</th>
                  <th className={th}>Status</th>
                  <th className={th}>Created</th>
                  <th className={`${th} w-24 text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-3"><CategoryLogo category={c} /></td>
                    <td className="max-w-[280px] px-3 py-3">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.description || c.slug}
                      </p>
                    </td>
                    <td className="px-3 py-3"><MerchantsCell category={c} onViewAll={() => setViewing(c)} /></td>
                    <td className="px-3 py-3"><StatusBadge isActive={c.isActive} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <RowActions
                        category={c}
                        onEdit={() => setFormTarget(c)}
                        onDelete={() => setDeleting(c)}
                        disabled={deleteMutation.isPending}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((c) => (
              <div key={c.id} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <CategoryLogo category={c} className="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.description || c.slug}</p>
                      </div>
                      <RowActions
                        category={c}
                        onEdit={() => setFormTarget(c)}
                        onDelete={() => setDeleting(c)}
                        disabled={deleteMutation.isPending}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge isActive={c.isActive} />
                    </div>
                    <div className="mt-2 border-t pt-2">
                      <MerchantsCell category={c} onViewAll={() => setViewing(c)} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {formTarget !== undefined && (
        <CategoryFormDialog
          key={formTarget?.id ?? 'new'}
          category={formTarget ?? undefined}
          onClose={() => setFormTarget(undefined)}
        />
      )}
      {viewing && <CategoryMerchantsDialog key={viewing.id} category={viewing} onClose={() => setViewing(null)} />}

      <ConfirmDialog
        open={!!deleting}
        title={`Delete "${deleting?.name ?? ''}"?`}
        message="This category will be permanently removed. This can't be undone."
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
