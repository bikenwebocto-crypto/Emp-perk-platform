'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface EvidenceGalleryProps {
  urls: string[] | null | undefined
  title?: string
}

export function EvidenceGallery({ urls, title = 'Evidence' }: EvidenceGalleryProps) {
  const [openUrl, setOpenUrl] = useState<string | null>(null)

  if (!urls || urls.length === 0) return null

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="mt-1 flex flex-wrap gap-3">
        {urls.map((url, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpenUrl(url)}
            className="group relative h-24 w-24 overflow-hidden rounded-lg border bg-muted"
            aria-label={`Open evidence ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Evidence ${i + 1}`}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      <Dialog open={!!openUrl} onOpenChange={(open) => { if (!open) setOpenUrl(null) }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {openUrl && (
            <div className="flex max-h-[80vh] items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={openUrl} alt={title} className="max-h-[75vh] w-auto object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}