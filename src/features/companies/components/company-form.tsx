'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { isValidPhone, toE164 } from '@/lib/phone'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { ArrowLeft, Save, Upload } from 'lucide-react'
import { CSVUploadDropzone } from '@/features/csv-uploads/components/csv-upload-dropzone'
import { useCreateCompany } from '@/hooks/queries/use-companies'
import { showToast } from '@/hooks/use-toast'

interface FormData {
  name: string
  email: string
  // password: string
  firstName: string
  lastName: string
  phone: string
  website: string
  employeeCount: string
  industry: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  taxId: string
}

interface FormErrors {
  [key: string]: string
}

export function CompanyForm() {
  const router = useRouter()
  const createCompany = useCreateCompany()
  const [errors, setErrors] = useState<FormErrors>({})
  const [showBulk, setShowBulk] = useState(false)

  const [form, setForm] = useState<FormData>({
    name: '',
    email: '',
    // password: '',
    firstName: '',
    lastName: '',
    phone: '',
    website: '',
    employeeCount: '',
    industry: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    taxId: '',
  })

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
    if (!form.name.trim()) errs.name = 'Company name is required'
    if (!form.email.trim()) errs.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email address'
    // if (!form.password) errs.password = 'Password is required'
    // else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters'
    if (!form.firstName.trim()) errs.firstName = 'First name is required'
    if (!form.lastName.trim()) errs.lastName = 'Last name is required'
    if (form.phone.trim() && !isValidPhone(form.phone)) errs.phone = 'Invalid phone number'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    createCompany.mutate(
      { ...form, employeeCount: form.employeeCount ? parseInt(form.employeeCount) : 0 },
      {
        onSuccess: (res) => {
          showToast({ type: 'success', title: res.message ?? 'Company created successfully' })
          router.push('/admin/companies')
        },
        onError: (err) => {
          showToast({ type: 'error', title: 'Failed to create company', description: err.message })
        },
      },
    )
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

      const requiredFields = ['name', 'email', 'password', 'firstname', 'lastname']
      const missing = requiredFields.filter((f) => !headers.includes(f))
      if (missing.length > 0) {
        showToast({ type: 'error', title: 'Missing required columns', description: `Required: ${requiredFields.join(', ')}. Missing: ${missing.join(', ')}` })
        return
      }

      let successCount = 0
      let errorCount = 0
      const errMsgs: string[] = []

      const processLine = async (i: number) => {
        if (i >= lines.length - 1) {
          if (successCount > 0) showToast({ type: 'success', title: 'Bulk upload complete', description: `${successCount} created, ${errorCount} failed` })
          if (errorCount > 0) showToast({ type: 'error', title: 'Some rows failed', description: errMsgs.slice(0, 5).join('; ') })
          router.refresh()
          return
        }

        const vals = (lines[i + 1] ?? '').split(',').map((v) => v.trim())
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => { row[h] = vals[idx] ?? '' })

        try {
          const res = await fetch('/api/admin/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: row.name,
              email: row.email,
              password: row.password,
              firstName: row.firstname,
              lastName: row.lastname,
              phone: toE164(row.phone) ?? row.phone ?? '',
              website: row.website || '',
              employeeCount: row.employeecount ? parseInt(row.employeecount) : 0,
              addressLine1: row.addressline1 || '',
              addressLine2: row.addressline2 || '',
              city: row.city || '',
              state: row.state || '',
              postalCode: row.postalcode || '',
              country: row.country || '',
              taxId: row.taxid || '',
              industry: row.industry || '',
            }),
          })
          const json = await res.json()
          if (res.ok) successCount++
          else {
            errorCount++
            errMsgs.push(`Row ${i + 2}: ${json.error?.message ?? 'Unknown error'}`)
          }
        } catch {
          errorCount++
          errMsgs.push(`Row ${i + 2}: Network error`)
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
            <h1 className="text-2xl font-bold tracking-tight">Add Company</h1>
            <p className="mt-1 text-sm text-muted-foreground">Register a new company with admin account</p>
          </div>
        </div>
        {/* <Button type="button" variant="outline" onClick={() => setShowBulk(!showBulk)}>
          <Upload className="mr-1 h-4 w-4" />Bulk Upload CSV
        </Button> */}
      </div>

      {showBulk && (
        <CSVUploadDropzone onUpload={handleBulkUpload} isUploading={createCompany.isPending} acceptedFormats=".csv" />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">Company Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Company Name <span className="text-destructive">*</span></label>
              <Input className={inputClass('name')} value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. TechCorp Inc." />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Company Email <span className="text-destructive">*</span></label>
              <Input type="email" className={inputClass('email')} value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="admin@company.com" />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
            </div>
            {/* <div>
              <label className="mb-1 block text-sm font-medium">Password <span className="text-destructive">*</span></label>
              <Input type="password" className={inputClass('password')} value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder="Min. 8 characters" />
              {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
            </div> */}
            <div>
              <label className="mb-1 block text-sm font-medium">Phone</label>
              <PhoneInput value={form.phone} onChange={(v) => setField('phone', v)} invalid={!!errors.phone} />
              {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Website</label>
              <Input type="url" value={form.website} onChange={(e) => setField('website', e.target.value)} placeholder="https://company.com" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Approx. Employee Count</label>
              <Input type="number" value={form.employeeCount} onChange={(e) => setField('employeeCount', e.target.value)} placeholder="e.g. 500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Tax ID</label>
              <Input value={form.taxId} onChange={(e) => setField('taxId', e.target.value)} placeholder="e.g. 12-3456789" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Industry</label>
              <Input value={form.industry} onChange={(e) => setField('industry', e.target.value)} placeholder="e.g. Technology, Healthcare, Retail" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Company Admin</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">The primary admin for this company will receive login credentials for these details.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">First Name <span className="text-destructive">*</span></label>
                <Input className={inputClass('firstName')} value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} placeholder="John" />
                {errors.firstName && <p className="mt-1 text-xs text-destructive">{errors.firstName}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Last Name <span className="text-destructive">*</span></label>
                <Input className={inputClass('lastName')} value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} placeholder="Doe" />
                {errors.lastName && <p className="mt-1 text-xs text-destructive">{errors.lastName}</p>}
              </div>
            </div>
          </CardContent>
          <CardHeader><CardTitle className="text-lg">Address</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Address Line 1</label>
              <Input value={form.addressLine1} onChange={(e) => setField('addressLine1', e.target.value)} placeholder="123 Main Street" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Address Line 2</label>
              <Input value={form.addressLine2} onChange={(e) => setField('addressLine2', e.target.value)} placeholder="Suite 100" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">City</label>
                <Input value={form.city} onChange={(e) => setField('city', e.target.value)} placeholder="New York" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">State</label>
                <Input value={form.state} onChange={(e) => setField('state', e.target.value)} placeholder="NY" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Postal Code</label>
                <Input value={form.postalCode} onChange={(e) => setField('postalCode', e.target.value)} placeholder="10001" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Country</label>
                <Input value={form.country} onChange={(e) => setField('country', e.target.value)} placeholder="United States" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <LoadingButton type="submit" loading={createCompany.isPending} loadingText="Saving...">
          <Save className="mr-1 h-4 w-4" />
          Save Company
        </LoadingButton>
      </div>
    </form>
  )
}
