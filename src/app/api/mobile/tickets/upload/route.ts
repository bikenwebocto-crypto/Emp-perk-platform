import { NextRequest, NextResponse } from 'next/server'
import { badRequest, internalError } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { uploadImage, TICKET_EVIDENCE_OPTIONS } from '@/lib/upload/image'

// Mirrors the shared ImageUploader defaults (see src/components/shared/ImageUploader.tsx):
// accepted MIME types and the 5 MB per-file cap.
const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'image/gif',
]
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB

// POST /api/mobile/tickets/upload
//
// Multipart form-data with a single `file` field. Authenticates the mobile
// employee, validates the file is an image within size limits, then uploads
// it to the existing Supabase Storage bucket under the shared `tickets`
// folder (TICKET_EVIDENCE_OPTIONS). Returns the public URL so the client can
// pass it back in evidenceUrls when creating the ticket.
//
// The per-ticket cap of 5 evidence images is enforced at POST/PATCH time by
// sanitizeEvidenceUrls (src/features/complaints/evidence.ts).
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const form = await request.formData()
    const file = form.get('file')

    if (!file || !(file instanceof File) || file.size === 0) {
      return badRequest('A file is required (field name "file")')
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return badRequest(
        'Unsupported file type. Allowed: ' +
          ACCEPTED_IMAGE_TYPES.map((t) => t.split('/')[1]).join(', '),
      )
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return badRequest('File exceeds the 5 MB limit')
    }

    // Server-side upload: use the service client so the upload does not
    // depend on a browser session. Reuses the shared uploadImage helper and
    // the existing TICKET_EVIDENCE_OPTIONS bucket/folder.
    const url = await uploadImage(file, {
      ...TICKET_EVIDENCE_OPTIONS,
      supabase: getAdminClient(),
    })

    return NextResponse.json({ success: true, data: { url } })
  } catch (error) {
    return internalError(error)
  }
}