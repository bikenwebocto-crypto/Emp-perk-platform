'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { showToast } from '@/hooks/use-toast'
import type { BannerRecord } from '../types/banner'
import { bannerDateInputValue } from '../utils/format-date'

interface EditBannerDialogProps {
  banner: BannerRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (banner: BannerRecord) => void
}

interface EditBannerForm {
  name: string
  description: string
  displayOrder: string
  pricePerDay: string
  minDays: string
  maxDays: string
  startDate: string
  expiresAt: string
}

function toForm(banner: BannerRecord): EditBannerForm {
  return {
    name: banner.name,
    description: banner.description ?? '',
    displayOrder: String(banner.displayOrder ?? 0),
    pricePerDay: String(banner.pricePerDay),
    minDays: String(banner.minDays),
    maxDays: String(banner.maxDays),
    startDate: bannerDateInputValue(banner.startDate),
    expiresAt: bannerDateInputValue(banner.expiresAt),
  }
}

/**
 * Create/edit dialog for a banner's configuration and schedule. Shared by the
 * banner list page and the banner details page so both stay in sync.
 */
export function EditBannerDialog({
  banner,
  open,
  onOpenChange,
  onSaved,
}: EditBannerDialogProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<EditBannerForm>(() =>
    banner ? toForm(banner) : {
      name: '',
      description: '',
      displayOrder: '0',
      pricePerDay: '',
      minDays: '7',
      maxDays: '30',
      startDate: '',
      expiresAt: '',
    },
  )

  useEffect(() => {
    if (banner) setForm(toForm(banner))
  }, [banner])

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/banners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update')
      return json
    },
    onSuccess: (json) => {
      queryClient.invalidateQueries({ queryKey: ['admin-banners'] })
      queryClient.invalidateQueries({ queryKey: ['admin-banner'] })
      onOpenChange(false)
      onSaved?.(json?.data)
      showToast({ type: 'success', title: 'Banner slot updated' })
    },
    onError: (e: Error) =>
      showToast({ type: 'error', title: 'Failed', description: e.message }),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!banner) return

    if (form.startDate && form.expiresAt && form.startDate > form.expiresAt) {
      showToast({
        type: 'error',
        title: 'Invalid schedule',
        description: 'The start date must be on or before the expiry date.',
      })
      return
    }

    updateMutation.mutate({
      id: banner.id,
      name: form.name,
      description: form.description || undefined,
      displayOrder: parseInt(form.displayOrder) || 0,
      pricePerDay: parseFloat(form.pricePerDay),
      minDays: parseInt(form.minDays),
      maxDays: parseInt(form.maxDays),
      startDate: form.startDate || null,
      expiresAt: form.expiresAt || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit: {banner?.name}</DialogTitle>
          <DialogDescription>
            Update the banner slot details and campaign schedule below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Name *
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Description
            </label>
            <Input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Price Per Day (€) *
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.pricePerDay}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pricePerDay: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Min Days
              </label>
              <Input
                type="number"
                min="1"
                value={form.minDays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minDays: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Max Days
              </label>
              <Input
                type="number"
                min="1"
                value={form.maxDays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxDays: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Display Order (slot number — lower = appears first)
            </label>
            <Input
              type="number"
              value={form.displayOrder}
              onChange={(e) =>
                setForm((f) => ({ ...f, displayOrder: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Start Date (optional — blank = available now)
              </label>
              <Input
                type="date"
                value={form.startDate}
                max={form.expiresAt || undefined}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startDate: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Expires At (optional — blank = no expiry)
              </label>
              <Input
                type="date"
                value={form.expiresAt}
                min={form.startDate || undefined}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expiresAt: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              loading={updateMutation.isPending}
              loadingText="Saving…"
            >
              Save
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
