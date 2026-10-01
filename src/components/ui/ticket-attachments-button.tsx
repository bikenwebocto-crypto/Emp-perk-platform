'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileText, Paperclip } from 'lucide-react'

interface TicketAttachmentsButtonProps {
  urls: string[] | null | undefined
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|avif|bmp)(\?.*)?$/i

function isImageUrl(url: string) {
  return IMAGE_EXT.test(url)
}

function fileNameFromUrl(url: string) {
  try {
    const name = new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'file'
    return decodeURIComponent(name)
  } catch {
    return 'file'
  }
}

export function TicketAttachmentsButton({ urls }: TicketAttachmentsButtonProps) {
  const [open, setOpen] = useState(false)

  if (!urls || urls.length === 0) return null

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Paperclip className="mr-1 h-4 w-4" />
        Attachments ({urls.length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attachments ({urls.length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {urls.map((url, i) => {
              if (isImageUrl(url)) {
                return (
                  <div key={i} className="overflow-hidden rounded-lg border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Attachment ${i + 1}`} className="max-h-64 w-full object-contain" />
                  </div>
                )
              }
              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-primary hover:bg-muted/50"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{fileNameFromUrl(url)}</span>
                </a>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}