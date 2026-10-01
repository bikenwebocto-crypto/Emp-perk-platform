'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmployeeLayout } from '@/components/employee/EmployeeLayout'
import { showToast } from '@/hooks/use-toast'
import { UserCircle, Save, Building2, Mail, Phone, MapPin } from 'lucide-react'

interface AddressInfo {
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
}

interface Profile {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  jobTitle: string | null
  department: string | null
  avatarUrl: string | null
  employeeId: string | null
  status: string
  address: AddressInfo | null
  company: { id: string; name: string; approvedDomain: string | null } | null
}

async function fetchProfile(): Promise<{ data: Profile }> {
  const res = await fetch('/api/employee/profile')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
  return json
}

const ADDRESS_KEYS: (keyof AddressInfo)[] = [
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
]

export default function EmployeeProfilePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['employee-profile'],
    queryFn: fetchProfile,
  })

  const [form, setForm] = useState<Partial<Profile> | null>(null)

  const update = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/employee/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update')
      return json
    },
    onSuccess: () => {
      setForm(null)
      showToast({ type: 'success', title: 'Profile updated' })
    },
    onError: (e: any) => showToast({ type: 'error', title: 'Update failed', description: e?.message }),
  })

  if (isLoading || !data?.data) {
    return (
      <EmployeeLayout>
        <Skeleton className="h-64 w-full" />
      </EmployeeLayout>
    )
  }

  const profile = data.data
  const values: any = form ?? profile
  const setField = (k: string, v: unknown) =>
    setForm((prev) => ({ ...(prev ?? profile), [k]: v } as any))

  const setAddressField = (k: keyof AddressInfo, v: string) =>
    setForm((prev) => {
      const base = prev ?? profile
      return {
        ...base,
        address: {
          ...(base.address ?? {}),
          [k]: v,
        },
      } as any
    })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload: Record<string, unknown> = {}

    // Personal fields
    for (const f of ['firstName', 'lastName', 'phone', 'jobTitle', 'department', 'avatarUrl']) {
      const a = (profile as any)[f]
      const b = (values as any)[f]
      if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) payload[f] = b
    }

    // Address fields — send as nested { address: { ...changed } }
    const addressChanges: Record<string, unknown> = {}
    const profAddr = profile.address ?? {}
    const valAddr = values.address ?? {}
    for (const f of ADDRESS_KEYS) {
      const a = (profAddr as any)[f] ?? null
      const b = (valAddr as any)[f] ?? null
      if (JSON.stringify(a) !== JSON.stringify(b)) addressChanges[f] = b
    }
    if (Object.keys(addressChanges).length > 0) {
      payload.address = addressChanges
    }

    if (Object.keys(payload).length === 0) {
      showToast({ type: 'info', title: 'No changes to save' })
      return
    }
    update.mutate(payload)
  }

  const addr: AddressInfo = values.address ?? {
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
  }

  return (
    <EmployeeLayout>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserCircle className="h-5 w-5" /> My Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              {values.avatarUrl ? (
                <img
                  src={values.avatarUrl}
                  alt="avatar"
                  className="h-16 w-16 rounded-full border object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-bold">
                  {(values.firstName?.[0] ?? '') + (values.lastName?.[0] ?? '')}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold">
                  {values.firstName} {values.lastName}
                </p>
                <p className="text-xs text-muted-foreground">{profile.email}</p>
                {profile.employeeId && (
                  <p className="text-xs text-muted-foreground">ID: {profile.employeeId}</p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">First name</label>
                <Input
                  value={values.firstName ?? ''}
                  onChange={(e) => setField('firstName', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Last name</label>
                <Input
                  value={values.lastName ?? ''}
                  onChange={(e) => setField('lastName', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  <Phone className="mr-1 inline h-3 w-3" /> Phone
                </label>
                <Input
                  value={values.phone ?? ''}
                  onChange={(e) => setField('phone', e.target.value)}
                  placeholder="+1 555-0100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Job Title</label>
                <Input
                  value={values.jobTitle ?? ''}
                  onChange={(e) => setField('jobTitle', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Department</label>
                <Input
                  value={values.department ?? ''}
                  onChange={(e) => setField('department', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Avatar URL
                </label>
                <Input
                  value={values.avatarUrl ?? ''}
                  onChange={(e) => setField('avatarUrl', e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                <Mail className="mr-1 inline h-3 w-3" /> Email
              </label>
              <Input value={profile.email} readOnly className="bg-muted/30" />
              <p className="mt-1 text-xs text-muted-foreground">
                Email cannot be changed here. Contact your company admin.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" /> Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Address Line 1
              </label>
              <Input
                value={addr.addressLine1 ?? ''}
                onChange={(e) => setAddressField('addressLine1', e.target.value)}
                placeholder="Street address, P.O. box, company name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Address Line 2
              </label>
              <Input
                value={addr.addressLine2 ?? ''}
                onChange={(e) => setAddressField('addressLine2', e.target.value)}
                placeholder="Apartment, suite, unit, building, floor"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">City</label>
                <Input
                  value={addr.city ?? ''}
                  onChange={(e) => setAddressField('city', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">State</label>
                <Input
                  value={addr.state ?? ''}
                  onChange={(e) => setAddressField('state', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Postal Code</label>
                <Input
                  value={addr.postalCode ?? ''}
                  onChange={(e) => setAddressField('postalCode', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Country</label>
                <Input
                  value={addr.country ?? ''}
                  onChange={(e) => setAddressField('country', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {profile.company && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" /> Company
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{profile.company.name}</p>
              {profile.company.approvedDomain && (
                <p className="text-xs text-muted-foreground">
                  Approved domain: {profile.company.approvedDomain}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={update.isPending}>
            Reset
          </Button>
          <LoadingButton type="submit" loading={update.isPending} loadingText="Saving…">
            <Save className="mr-1 h-4 w-4" />
            Save Profile
          </LoadingButton>
        </div>
      </form>
    </EmployeeLayout>
  )
}
