'use client'
import { ImageUploader } from '@/components/shared/ImageUploader'
import type { PendingImage, DeferredFile } from '@/components/shared/ImageUploader'
import { OFFER_IMAGE_OPTIONS } from '@/lib/upload/image'

export type { PendingImage }

interface OfferImageUploaderProps {
  onImagesReady?: (images: PendingImage[]) => void
  onFilesSelected?: (files: DeferredFile[]) => void
  disabled?: boolean
  currentCount: number
  uploadMode?: 'immediate' | 'deferred'
}

export function OfferImageUploader({
  onImagesReady,
  onFilesSelected,
  disabled,
  currentCount,
  uploadMode = 'immediate',
}: OfferImageUploaderProps) {
  return (
    <ImageUploader
      onImagesReady={uploadMode === 'immediate' ? onImagesReady : undefined}
      onFilesSelected={uploadMode === 'deferred' ? onFilesSelected : undefined}
      uploadMode={uploadMode}
      disabled={disabled}
      currentCount={currentCount}
      uploadOptions={OFFER_IMAGE_OPTIONS}
      acceptedTypes={[
        'image/jpeg',
        'image/png',
        'image/svg+xml',
        'image/webp',
        'image/gif',
      ]}
      maxFileSize={5 * 1024 * 1024}
      maxFiles={8}
      placeholder="Drop images here or click to browse"
      allowMultiple
    />
  )
}