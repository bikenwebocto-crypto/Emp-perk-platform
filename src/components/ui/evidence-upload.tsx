'use client'

import { useEffect, useState } from 'react'
import { ImageUpload } from '@/components/ui/image-upload'
import type { DeferredFile } from '@/components/shared/ImageUploader'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import type { UploadImageOptions } from '@/lib/upload/image'
import { TICKET_EVIDENCE_OPTIONS } from '@/lib/upload/image'

interface EvidenceUploadProps {
  files: DeferredFile[]
  onChange: (files: DeferredFile[]) => void
  disabled?: boolean
  label?: string
  helperText?: string
  max?: number
  uploadOptions?: UploadImageOptions
}

export function EvidenceUpload({
  files,
  onChange,
  disabled = false,
  label = 'Evidence Screenshots',
  helperText,
  max = 5,
  uploadOptions = TICKET_EVIDENCE_OPTIONS,
}: EvidenceUploadProps) {
  const [dropzoneKey, setDropzoneKey] = useState(0)

  const remaining = max - files.length

  useEffect(() => {
    return () => {
      files.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAdd(deferred: DeferredFile | null) {
    if (!deferred || remaining <= 0) return
    const withOwnPreview: DeferredFile = {
      file: deferred.file,
      previewUrl: URL.createObjectURL(deferred.file),
    }
    onChange([...files, withOwnPreview])
    setDropzoneKey((k) => k + 1)
  }

  function handleRemove(index: number) {
    const file = files[index]
    if (!file) return
    URL.revokeObjectURL(file.previewUrl)
    onChange(files.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      {label && (
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      )}
      {helperText && (
        <p className="mb-1 text-xs text-muted-foreground">{helperText}</p>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {files.map((file, i) => (
            <div key={i} className="relative">
              <img
                src={file.previewUrl}
                alt={`Evidence ${i + 1}`}
                className="h-24 w-24 rounded-md border object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -right-2 -top-2 h-6 w-6"
                onClick={() => handleRemove(i)}
                disabled={disabled}
                aria-label="Remove evidence"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <ImageUpload
          key={dropzoneKey}
          value=""
          onChange={() => {}}
          uploadMode="deferred"
          uploadOptions={uploadOptions}
          onDeferredFile={handleAdd}
          disabled={disabled}
          label=""
        />
      )}

      {remaining === 0 && (
        <p className="text-xs text-muted-foreground">Maximum {max} screenshots added</p>
      )}
    </div>
  )
}