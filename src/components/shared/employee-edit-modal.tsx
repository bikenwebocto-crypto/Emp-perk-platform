'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { showToast } from '@/hooks/use-toast'
import { uploadImage, EMPLOYEE_AVATAR_OPTIONS } from '@/lib/upload/image'
import { X, Save, Upload, Loader2, User } from 'lucide-react'

export interface EmployeeEditFormData {
  firstName: string
  lastName: string
  email?: string
  employeeId: string
  department: string
  jobTitle: string
  phone: string
  status?: string
  avatarUrl?: string | null
}

export interface EmployeeEditModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<EmployeeEditFormData>) => Promise<void> | void
  employee: Partial<EmployeeEditFormData> & { id: string }
  scope: 'admin' | 'company'
  saving?: boolean
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

export function EmployeeEditModal({
  open,
  onClose,
  onSave,
  employee,
  scope,
  saving,
}: EmployeeEditModalProps) {
  const [form, setForm] = useState<EmployeeEditFormData>({
    firstName: '',
    lastName: '',
    email: '',
    employeeId: '',
    department: '',
    jobTitle: '',
    phone: '',
    status: 'ACTIVE',
    avatarUrl: null,
  })
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)

  // Sync form when modal opens; clear pending avatar state
  useEffect(() => {
    if (open && employee) {
      setForm({
        firstName: employee.firstName ?? '',
        lastName: employee.lastName ?? '',
        email: employee.email ?? '',
        employeeId: employee.employeeId ?? '',
        department: employee.department ?? '',
        jobTitle: employee.jobTitle ?? '',
        phone: employee.phone ?? '',
        status: employee.status ?? 'ACTIVE',
        avatarUrl: employee.avatarUrl ?? null,
      })
      setPendingAvatarFile(null)
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      setAvatarPreviewUrl(null)
    }
  }, [open, employee])

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  if (!open) return null

  const isAdmin = scope === 'admin'

  const update = (field: keyof EmployeeEditFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type)) {
      showToast({ type: 'error', title: 'Invalid file type', description: 'Please upload a JPEG, PNG, or WebP image.' })
      return
    }
    if (file.size > MAX_SIZE) {
      showToast({ type: 'error', title: 'File too large', description: 'Avatar must be 5 MB or smaller.' })
      return
    }

    // Revoke previous preview URL if any
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
    const objectUrl = URL.createObjectURL(file)
    previewUrlRef.current = objectUrl
    setAvatarPreviewUrl(objectUrl)
    setPendingAvatarFile(file)

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveAvatar = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setAvatarPreviewUrl(null)
    setPendingAvatarFile(null)
    setForm((f) => ({ ...f, avatarUrl: null }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName.trim()) {
      showToast({ type: 'error', title: 'First name is required' })
      return
    }
    if (!form.lastName.trim()) {
      showToast({ type: 'error', title: 'Last name is required' })
      return
    }

    const payload: Partial<EmployeeEditFormData> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      employeeId: form.employeeId.trim() || undefined,
      department: form.department.trim() || undefined,
      jobTitle: form.jobTitle.trim() || undefined,
      phone: form.phone.trim() || undefined,
    }

    // Upload pending avatar file NOW (on save, not on select)
    if (pendingAvatarFile) {
      setAvatarUploading(true)
      try {
        const url = await uploadImage(pendingAvatarFile, EMPLOYEE_AVATAR_OPTIONS)
        payload.avatarUrl = url
      } catch (err: any) {
        showToast({ type: 'error', title: 'Avatar upload failed', description: err?.message ?? 'Failed to upload avatar.' })
        setAvatarUploading(false)
        return
      }
      setAvatarUploading(false)
    } else if (form.avatarUrl !== (employee.avatarUrl ?? null)) {
      payload.avatarUrl = form.avatarUrl
    }

    if (isAdmin) {
      if (form.email?.trim()) payload.email = form.email.trim()
      if (form.status) payload.status = form.status
    }

    try {
      await onSave(payload)
      showToast({ type: 'success', title: 'Employee updated' })
      onClose()
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Failed to update employee',
        description: err?.message,
      })
    }
  }

  // Show local preview if a file was just selected, otherwise the saved avatarUrl
  const displayAvatarUrl = avatarPreviewUrl ?? form.avatarUrl
  console.log('displayAvatarUrl:', form)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Edit Employee</h3>
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? 'Update profile fields. Email and status changes are logged.'
                : 'Update profile fields. Email and status cannot be changed here.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit dialog"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border bg-muted">
              {displayAvatarUrl ? (
                <img
                  src={displayAvatarUrl}
                  alt="avatar"
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Avatar
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                onChange={handleAvatarChange}
                disabled={avatarUploading || saving}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading || saving}
                >
                  {avatarUploading ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-1 h-3 w-3" />
                      {displayAvatarUrl ? 'Change Avatar' : 'Upload Avatar'}
                    </>
                  )}
                </Button>
                {displayAvatarUrl && !avatarUploading && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    disabled={saving}
                    className="text-muted-foreground"
                  >
                    Remove
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                JPEG, PNG, or WebP. Max 5 MB. Uploaded on save.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                First Name *
              </label>
              <Input
                value={form.firstName}
                onChange={update('firstName')}
                required
                disabled={saving}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Last Name *
              </label>
              <Input
                value={form.lastName}
                onChange={update('lastName')}
                required
                disabled={saving}
              />
            </div>
          </div>

          {isAdmin && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Email
              </label>
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={update('email')}
                disabled={saving}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Employee ID
              </label>
              <Input
                value={form.employeeId}
                onChange={update('employeeId')}
                disabled={saving}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Phone
              </label>
              <Input
                value={form.phone}
                onChange={update('phone')}
                disabled={saving}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Department
              </label>
              <Input
                value={form.department}
                onChange={update('department')}
                disabled={saving}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Job Title
              </label>
              <Input
                value={form.jobTitle}
                onChange={update('jobTitle')}
                disabled={saving}
              />
            </div>
          </div>

          {isAdmin && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Status
              </label>
              <select
                value={form.status ?? 'ACTIVE'}
                onChange={update('status')}
                disabled={saving}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="INVITED">Invited</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="INELIGIBLE">Ineligible</option>
              </select>
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving || avatarUploading}>
              Cancel
            </Button>
            <LoadingButton type="submit" loading={saving || avatarUploading} loadingText={avatarUploading ? 'Uploading...' : 'Saving...'}>
              <Save className="mr-1 h-4 w-4" />
              Save Changes
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  )
}
