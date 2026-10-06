'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLead } from '@/hooks/queries/use-leads'
import { leadToMerchantPrefill } from '@/lib/leads/prefill'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { isValidPhone, toE164 } from '@/lib/phone'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { ArrowLeft, Save, Upload, Image as ImageIcon } from 'lucide-react'
import { CSVUploadDropzone } from '@/features/csv-uploads/components/csv-upload-dropzone'
import { useCreateMerchant, useUpdateMerchant } from '@/hooks/queries/use-merchants'
import { showToast } from '@/hooks/use-toast'
import { useCategories } from '@/hooks/queries/use-categories'
import { ImageUploader } from '@/components/shared/ImageUploader'
import type { DeferredFile } from '@/components/shared/ImageUploader'
import { uploadImage, MERCHANT_LOGO_OPTIONS, MERCHANT_COVER_OPTIONS } from '@/lib/upload/image'

interface FormData {
  businessName: string
  email: string
  // password: string
  contactName: string
  contactPhone: string
  categoryId: string
  description: string
  website: string
  logoUrl?: string
  coverImageUrl?: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
}

interface FormErrors {
  [key: string]: string
}

interface MerchantFormProps {
  merchantId?: string
  initialData?: FormData
}

export function MerchantForm({ merchantId, initialData }: MerchantFormProps) {
  const router = useRouter()
  const isEdit = !!merchantId
  const createMerchant = useCreateMerchant()
  const updateMerchant = useUpdateMerchant()
  const [errors, setErrors] = useState<FormErrors>({})
  const [showBulk, setShowBulk] = useState(false)
  const [pendingLogoFile, setPendingLogoFile] = useState<DeferredFile | null>(null)
  const [pendingCoverFile, setPendingCoverFile] = useState<DeferredFile | null>(null)
  const [uploadingImages, setUploadingImages] = useState(false)
  const { data: categories } = useCategories()

  const [form, setForm] = useState<FormData>(initialData ?? {
    businessName: '',
    email: '',
    // password: '',
    contactName: '',
    contactPhone: '',
    categoryId: '',
    description: '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
  })

  // Converting a lead: /admin/merchants/add?leadId=... (create only)
  const searchLeadId = useSearchParams().get('leadId')
  const leadId = isEdit ? null : searchLeadId
  const { data: lead } = useLead(leadId)
  const prefilled = useRef(false)
  useEffect(() => {
    // Wait for categories so the industry → category match can run.
    if (!lead || !categories || prefilled.current) return
    prefilled.current = true
    setForm((prev) => ({ ...prev, ...leadToMerchantPrefill(lead, categories) }))
  }, [lead, categories])

  const setField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validate = (): boolean => {
    const errs: FormErrors = {}
    if (!form.businessName.trim()) errs.businessName = 'Business name is required'
    if (!form.email.trim()) errs.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email address'
    // if (!isEdit && !form.password) errs.password = 'Password is required'
    // else if (form.password && form.password.length < 8) errs.password = 'Password must be at least 8 characters'
    if (!form.contactName.trim()) errs.contactName = 'Contact name is required'
    if (!form.contactPhone.trim()) errs.contactPhone = 'Phone number is required'
    else if (!isValidPhone(form.contactPhone)) errs.contactPhone = 'Invalid phone number'
    if (!form.addressLine1.trim()) errs.addressLine1 = 'Address is required'
    if (!form.city.trim()) errs.city = 'City is required'
    if (!form.postalCode.trim()) errs.postalCode = 'Postal code is required'
    if (!form.country.trim()) errs.country = 'Country is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const mutation = isEdit ? updateMerchant : createMerchant

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    let uploadedLogoUrl: string | null = null
    let uploadedCoverUrl: string | null = null

    if (pendingLogoFile || pendingCoverFile) {
      setUploadingImages(true)
      try {
        const uploads: Promise<void>[] = []
        if (pendingLogoFile) {
          uploads.push(
            uploadImage(pendingLogoFile.file, MERCHANT_LOGO_OPTIONS).then((url) => {
              uploadedLogoUrl = url
            })
          )
        }
        if (pendingCoverFile) {
          uploads.push(
            uploadImage(pendingCoverFile.file, MERCHANT_COVER_OPTIONS).then((url) => {
              uploadedCoverUrl = url
            })
          )
        }
        await Promise.all(uploads)
      } catch (err: any) {
        setUploadingImages(false)
        showToast({ type: 'error', title: 'Image upload failed', description: err.message || 'Failed to upload images. Please try again.' })
        return
      }
      setUploadingImages(false)
    }

    const body = { ...form } as Record<string, unknown>
    if (uploadedLogoUrl) body.logoUrl = uploadedLogoUrl
    if (uploadedCoverUrl) body.coverImageUrl = uploadedCoverUrl
    if (typeof body.logoUrl === 'string' && !body.logoUrl.trim()) delete body.logoUrl
    if (typeof body.coverImageUrl === 'string' && !body.coverImageUrl.trim()) delete body.coverImageUrl
    if (!body.password) delete body.password
    if (isEdit) body.id = merchantId
    if (leadId) body.leadId = leadId
    console.log('Mutation body:', body)
    const mutateFn = isEdit
      ? (data: typeof body) => updateMerchant.mutateAsync(data as any)
      : (data: typeof body) => createMerchant.mutateAsync(data as any)

    try {
      const res = await mutateFn(body)
      console.log('Mutation response:', res)
      showToast({ type: 'success', title: res.message ?? (isEdit ? 'Merchant updated' : 'Merchant created') })
      router.push(leadId ? `/admin/leads/${leadId}` : '/admin/merchants')
    } catch (err: any) {
      showToast({ type: 'error', title: isEdit ? 'Failed to update merchant' : 'Failed to create merchant', description: err.message })
    }
  }

  const handleBulkUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').filter(Boolean)
      if (lines.length < 2) {
        showToast({ type: 'error', title: 'CSV must have a header row and at least one data row' })
        return
      }

      const headers = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase())
      const requiredFields = ['businessname', 'email', 'password', 'contactname']
      const missing = requiredFields.filter((f) => !headers.includes(f))
      if (missing.length > 0) {
        showToast({ type: 'error', title: 'Missing required columns', description: `Required: ${requiredFields.join(', ')}. Missing: ${missing.join(', ')}` })
        return
      }

      let successCount = 0
      let errorCount = 0
      const errors: string[] = []

      const processLine = async (i: number) => {
        if (i >= lines.length - 1) {
          if (successCount > 0) showToast({ type: 'success', title: `Bulk upload complete`, description: `${successCount} created, ${errorCount} failed` })
          if (errorCount > 0) showToast({ type: 'error', title: 'Some rows failed', description: errors.slice(0, 5).join('; ') })
          router.refresh()
          return
        }

        const vals = (lines[i + 1] ?? '').split(',').map((v) => v.trim())
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => { row[h] = vals[idx] ?? '' })

        try {
          const res = await fetch('/api/admin/merchants/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              businessName: row.businessname,
              email: row.email,
              password: row.password,
              contactName: row.contactname,
              contactPhone: toE164(row.contactphone) ?? row.contactphone ?? '',
              categoryId: row.categoryid || '',
              description: row.description || '',
              website: row.website || '',
              addressLine1: row.addressline1 || '',
              addressLine2: row.addressline2 || '',
              city: row.city || '',
              state: row.state || '',
              postalCode: row.postalcode || '',
              country: row.country || '',
            }),
          })
          const json = await res.json()
          if (res.ok) successCount++
          else {
            errorCount++
            errors.push(`Row ${i + 2}: ${json.error?.message ?? 'Unknown error'}`)
          }
        } catch {
          errorCount++
          errors.push(`Row ${i + 2}: Network error`)
        }
        processLine(i + 1)
      }

      processLine(0)
    }
    reader.readAsText(file)
  }

  const inputClass = (field: string) =>
    `w-full ${errors[field] ? 'border-destructive focus-visible:ring-destructive' : ''}`

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button type="button" variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{isEdit ? 'Edit Merchant' : 'Add Merchant'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{isEdit ? 'Update merchant account details' : 'Register a new merchant account'}</p>
          </div>
        </div>
        {!isEdit && (
          <Button type="button" variant="outline" onClick={() => setShowBulk(!showBulk)}>
            <Upload className="mr-1 h-4 w-4" />Bulk Upload CSV
          </Button>
        )}
      </div>

      {showBulk && (
        <CSVUploadDropzone onUpload={handleBulkUpload} isUploading={createMerchant.isPending} acceptedFormats=".csv" />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">Business Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Business Name <span className="text-destructive">*</span></label>
              <Input className={inputClass('businessName')} value={form.businessName} onChange={(e) => setField('businessName', e.target.value)} placeholder="e.g. Joe's Coffee Shop" />
              {errors.businessName && <p className="mt-1 text-xs text-destructive">{errors.businessName}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email <span className="text-destructive">*</span></label>
              <Input type="email" className={inputClass('email')} value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="contact@business.com" />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
            </div>
            <div>
              {/* <label className="mb-1 block text-sm font-medium">Password <span className="text-destructive">*</span></label>
              <Input type="password" className={inputClass('password')} value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder="Min. 8 characters" />
              {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>} */}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Contact Name <span className="text-destructive">*</span></label>
              <Input className={inputClass('contactName')} value={form.contactName} onChange={(e) => setField('contactName', e.target.value)} placeholder="Full name" />
              {errors.contactName && <p className="mt-1 text-xs text-destructive">{errors.contactName}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Contact Phone <span className="text-destructive">*</span></label>
              <PhoneInput value={form.contactPhone} onChange={(v) => setField('contactPhone', v)} invalid={!!errors.contactPhone} />
              {errors.contactPhone && <p className="mt-1 text-xs text-destructive">{errors.contactPhone}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Category</label>
              <select
                value={form.categoryId}
                onChange={(e) => setField('categoryId', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select category</option>
                {(categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Description</label>
              <textarea
                className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Brief description of your business"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Website</label>
              <Input type="url" value={form.website} onChange={(e) => setField('website', e.target.value)} placeholder="https://example.com" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Address</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Address Line 1 <span className="text-destructive">*</span></label>
              <Input className={inputClass('addressLine1')} value={form.addressLine1} onChange={(e) => setField('addressLine1', e.target.value)} placeholder="123 Main Street" />
              {errors.addressLine1 && <p className="mt-1 text-xs text-destructive">{errors.addressLine1}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Address Line 2</label>
              <Input value={form.addressLine2} onChange={(e) => setField('addressLine2', e.target.value)} placeholder="Suite 100" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">City <span className="text-destructive">*</span></label>
                <Input className={inputClass('city')} value={form.city} onChange={(e) => setField('city', e.target.value)} placeholder="New York" />
                {errors.city && <p className="mt-1 text-xs text-destructive">{errors.city}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">State</label>
                <Input value={form.state} onChange={(e) => setField('state', e.target.value)} placeholder="NY" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Postal Code <span className="text-destructive">*</span></label>
                <Input className={inputClass('postalCode')} value={form.postalCode} onChange={(e) => setField('postalCode', e.target.value)} placeholder="10001" />
                {errors.postalCode && <p className="mt-1 text-xs text-destructive">{errors.postalCode}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Country <span className="text-destructive">*</span></label>
                <Input className={inputClass('country')} value={form.country} onChange={(e) => setField('country', e.target.value)} placeholder="United States" />
                {errors.country && <p className="mt-1 text-xs text-destructive">{errors.country}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImageIcon className="h-5 w-5" /> Branding
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted-foreground">
                Logo
              </label>
              <ImageUploader
                uploadMode="deferred"
                onFilesSelected={(files) => { setPendingLogoFile(files[0] ?? null) }}
                currentCount={form.logoUrl ? 1 : 0}
                uploadOptions={MERCHANT_LOGO_OPTIONS}
                acceptedTypes={['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']}
                maxFileSize={5 * 1024 * 1024}
                maxFiles={5}
                allowMultiple={false}
                placeholder="Drop logo here"
                showRemaining={false}
                currentImageUrl={pendingLogoFile ? null : (form.logoUrl ?? null)}
                previewClassName="h-20 w-20 rounded-full border-2 border-primary/20 object-cover shadow-sm"
                previewHint="512×512 · Square"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted-foreground">
                Cover Image
              </label>
              <ImageUploader
                uploadMode="deferred"
                onFilesSelected={(files) => { setPendingCoverFile(files[0] ?? null) }}
                currentCount={form.coverImageUrl ? 1 : 0}
                uploadOptions={MERCHANT_COVER_OPTIONS}
                acceptedTypes={['image/jpeg', 'image/png', 'image/webp']}
                maxFileSize={5 * 1024 * 1024}
                maxFiles={5}
                allowMultiple={false}
                placeholder="Drop cover image here"
                showRemaining={false}
                currentImageUrl={pendingCoverFile ? null : (form.coverImageUrl ?? null)}
                previewClassName="h-24 w-full rounded-lg border object-cover shadow-sm"
                previewHint="1200×400 · Landscape"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <LoadingButton type="submit" loading={mutation.isPending || uploadingImages} loadingText="Saving...">
          <Save className="mr-1 h-4 w-4" />
          {isEdit ? 'Update Merchant' : 'Save Merchant'}
        </LoadingButton>
      </div>
    </form>
  )
}
