'use client'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { LoadingButton } from '@/components/ui/loading-button'
import { ImageUploader, type DeferredFile } from '@/components/shared/ImageUploader'
import { showToast } from '@/hooks/use-toast'
import { useCreateCategory, useUpdateCategory } from '@/hooks/queries/use-admin-categories'
import { CATEGORY_LOGO_OPTIONS, deleteImage, uploadImage } from '@/lib/upload/image'
import { createCategorySchema } from '../schemas'
import type { AdminCategoryRow } from '../types'

type Errors = Partial<Record<'name' | 'description' | 'logo', string>>

interface CategoryFormDialogProps {
  /** Omit to create a new category; pass a row to edit it. */
  category?: AdminCategoryRow
  onClose: () => void
}

export function CategoryFormDialog({ category, onClose }: CategoryFormDialogProps) {
  const isEdit = !!category
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [isActive, setIsActive] = useState(category?.isActive ?? true)
  const [pendingLogo, setPendingLogo] = useState<DeferredFile | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState<Errors>({})

  const createMutation = useCreateCategory()
  const updateMutation = useUpdateCategory()
  const busy = uploading || createMutation.isPending || updateMutation.isPending

  const existingLogo = removeLogo ? null : category?.logoUrl ?? null
  const previewUrl = pendingLogo?.previewUrl ?? existingLogo

  const handleOpenChange = (open: boolean) => {
    if (!open && !busy) onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = createCategorySchema.safeParse({ name, description })
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors
      setErrors({ name: fe.name?.[0], description: fe.description?.[0] })
      return
    }
    setErrors({})

    let uploadedUrl: string | undefined
    if (pendingLogo) {
      setUploading(true)
      try {
        uploadedUrl = await uploadImage(pendingLogo.file, CATEGORY_LOGO_OPTIONS)
      } catch (err) {
        setErrors({ logo: err instanceof Error ? err.message : 'Logo upload failed' })
        return
      } finally {
        setUploading(false)
      }
    }

    const onError = (err: Error) => {
      // Don't leave an unused file in the bucket.
      if (uploadedUrl) void deleteImage(uploadedUrl, { bucket: CATEGORY_LOGO_OPTIONS.bucket })
      showToast({ type: 'error', title: isEdit ? 'Could not update category' : 'Could not create category', description: err.message })
    }

    if (!isEdit) {
      createMutation.mutate(
        { ...parsed.data, logoUrl: uploadedUrl },
        {
          onSuccess: () => {
            showToast({ type: 'success', title: 'Category created', description: parsed.data.name })
            onClose()
          },
          onError,
        },
      )
      return
    }

    updateMutation.mutate(
      {
        id: category.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        isActive,
        ...(uploadedUrl ? { logoUrl: uploadedUrl } : removeLogo ? { logoUrl: null } : {}),
      },
      {
        onSuccess: () => {
          showToast({ type: 'success', title: 'Category updated', description: parsed.data.name })
          onClose()
        },
        onError,
      },
    )
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Category' : 'Add Category'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update the details of “${category.name}”.`
              : 'Create a merchant category. You can add a logo now or leave it empty.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="category-name" className="text-sm font-medium">Name</label>
            <Input
              id="category-name"
              value={name}
              maxLength={100}
              placeholder="e.g. Food & Dining"
              onChange={(e) => { setName(e.target.value); setErrors((er) => ({ ...er, name: undefined })) }}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="category-description" className="text-sm font-medium">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="category-description"
              value={description}
              maxLength={500}
              rows={3}
              onChange={(e) => { setDescription(e.target.value); setErrors((er) => ({ ...er, description: undefined })) }}
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">
              Logo <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <ImageUploader
              uploadMode="deferred"
              onFilesSelected={(files) => {
                setPendingLogo(files[0] ?? null)
                setRemoveLogo(false)
                setErrors((er) => ({ ...er, logo: undefined }))
              }}
              disabled={busy}
              currentCount={0}
              uploadOptions={CATEGORY_LOGO_OPTIONS}
              acceptedTypes={['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']}
              maxFileSize={5 * 1024 * 1024}
              maxFiles={1}
              allowMultiple={false}
              placeholder={previewUrl ? 'Drop a new logo to replace' : 'Drop logo here'}
              showRemaining={false}
              currentImageUrl={previewUrl}
              previewClassName="h-20 w-20 rounded-lg border object-contain p-1"
              previewHint="Square image · PNG, JPG, SVG or WebP · max 5 MB"
            />
            {(pendingLogo || existingLogo) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (pendingLogo) setPendingLogo(null)
                  else setRemoveLogo(true)
                }}
              >
                {pendingLogo && category?.logoUrl && !removeLogo ? 'Keep current logo' : 'Remove logo'}
              </Button>
            )}
            {errors.logo && <p className="text-xs text-destructive">{errors.logo}</p>}
          </div>

          {isEdit && (
            <label className="flex items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
              />
              <span>
                <span className="text-sm font-medium">Active</span>
                <span className="block text-xs text-muted-foreground">
                  Inactive categories are hidden from employees and category dropdowns.
                </span>
              </span>
            </label>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <LoadingButton
              type="submit"
              loading={busy}
              loadingText={uploading ? 'Uploading logo...' : 'Saving...'}
            >
              {isEdit ? 'Save changes' : 'Create category'}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
