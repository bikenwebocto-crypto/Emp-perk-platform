'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { EvidenceUpload } from '@/components/ui/evidence-upload'
import type { DeferredFile } from '@/components/shared/ImageUploader'
import { uploadDeferredImage } from '@/components/ui/image-upload'
import { TICKET_EVIDENCE_OPTIONS } from '@/lib/upload/image'
import { showToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  APPLICATION_SUPPORT_CATEGORIES,
  getPriorityForCategory,
  PRIORITY_STYLES,
} from '@/features/complaints/constants'

export default function NewCompanyComplaintPage() {
  const router = useRouter()
  const [category, setCategory] = useState('TECHNICAL')
  const [description, setDescription] = useState('')
  const [evidenceFiles, setEvidenceFiles] = useState<DeferredFile[]>([])
  const [uploadingEvidence, setUploadingEvidence] = useState(false)

  const priority = getPriorityForCategory(category)

  const createAppSupport = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/complaints/application-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to submit')
      return json
    },
    onSuccess: () => {
      showToast({ type: 'success', title: 'Ticket submitted', description: 'Your support ticket has been created.' })
      router.push('/company/complaints')
    },
    onError: (e: Error) => showToast({ type: 'error', title: 'Failed', description: e.message }),
  })

  async function handleSubmit() {
    if (!description.trim()) {
      showToast({ type: 'error', title: 'Required', description: 'Please describe your issue.' })
      return
    }

    const urls: string[] = []
    if (evidenceFiles.length > 0) {
      setUploadingEvidence(true)
      try {
        for (const deferred of evidenceFiles) {
          const url = await uploadDeferredImage(deferred, TICKET_EVIDENCE_OPTIONS)
          if (url) urls.push(url)
        }
      } catch (uploadErr) {
        setUploadingEvidence(false)
        showToast({
          type: 'error',
          title: 'Upload failed',
          description: uploadErr instanceof Error ? uploadErr.message : 'Could not upload evidence images.',
        })
        return
      }
      setUploadingEvidence(false)
    }

    createAppSupport.mutate({
      category,
      description: description.trim(),
      ...(urls.length > 0 ? { evidenceUrls: urls } : {}),
    })
  }

  function handleOpenChange(open: boolean) {
    if (!open) router.push('/company/complaints')
  }

  return (
    <div className="space-y-6">
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Support Ticket</DialogTitle>
            <DialogDescription>Application Support</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={createAppSupport.isPending}
              >
                {APPLICATION_SUPPORT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Priority</label>
              <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/30 px-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}>
                  {priority}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Automatically determined by category</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Description *</label>
              <textarea
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your issue..."
                disabled={createAppSupport.isPending || uploadingEvidence}
                required
              />
            </div>

            <EvidenceUpload
              files={evidenceFiles}
              onChange={setEvidenceFiles}
              disabled={createAppSupport.isPending || uploadingEvidence}
              label="Evidence Screenshots (optional)"
              helperText="Screenshots are uploaded to S3 when you submit. Max 5."
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/company/complaints')}
              disabled={createAppSupport.isPending || uploadingEvidence}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={createAppSupport.isPending || uploadingEvidence}
            >
              {uploadingEvidence || createAppSupport.isPending ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> {uploadingEvidence ? 'Uploading…' : 'Submitting…'}</>
              ) : (
                'Submit Ticket'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
