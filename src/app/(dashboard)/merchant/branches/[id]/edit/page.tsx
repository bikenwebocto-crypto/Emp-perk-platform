'use client'

import { use, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { showToast } from '@/hooks/use-toast'
import { BranchForm, valuesToPayload, type BranchFormValues } from '@/components/merchant/branches/BranchForm'
import { useMerchantBranch, useUpdateBranch } from '@/hooks/queries/use-merchant-branches'
import { normalizeOpeningHours } from '@/lib/branch-helpers'

export default function EditBranchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: branch, isLoading } = useMerchantBranch(id)
  const updateBranch = useUpdateBranch(id)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const initialValues = useMemo<Partial<BranchFormValues> | undefined>(() => {
    if (!branch) return undefined
    return {
      name: branch.name ?? '',
      addressLine1: branch.addressLine1 ?? '',
      addressLine2: branch.addressLine2 ?? '',
      city: branch.city ?? '',
      state: branch.state ?? '',
      postalCode: branch.postalCode ?? '',
      country: branch.country ?? '',
      phone: branch.phone ?? '',
      email: branch.email ?? '',
      latitude: branch.latitude ? Number(branch.latitude) : null,
      longitude: branch.longitude ? Number(branch.longitude) : null,
      openingHours: normalizeOpeningHours(branch.openingHours),
      isPrimary: Boolean(branch.isPrimary),
      branchType: branch.branchType ?? 'IN_STORE',
      deliveryRadiusKm: branch.deliveryRadiusKm ?? null,
      isNationwide: Boolean(branch.isNationwide),
      storefrontImageUrl: branch.storefrontImageUrl ?? '',
      branchImages: branch.branchImages ?? [],
      parkingInfo: branch.parkingInfo ?? '',
      wheelchairAccess: Boolean(branch.wheelchairAccess),
      landmark: branch.landmark ?? '',
      description: branch.description ?? '',
      websiteUrl: branch.websiteUrl ?? '',
      status: branch.status ?? 'ACTIVE',
    }
  }, [branch])

  async function handleSubmit(values: BranchFormValues) {
    setErrors({})
    try {
      const result = await updateBranch.mutateAsync(valuesToPayload(values) as any)
      if (result?.requiresApproval) {
        showToast({
          type: 'info',
          title: 'Branch updated',
          description: 'Location changes require admin approval before they appear in employee search.',
        })
      } else {
        showToast({ type: 'success', title: 'Branch updated' })
      }
      router.push(`/merchant/branches/${id}`)
    } catch (e: any) {
      if (e.details) {
        setErrors(e.details)
        showToast({ type: 'error', title: 'Validation failed', description: e.message })
      } else {
        showToast({ type: 'error', title: 'Failed to update branch', description: e.message })
      }
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!branch) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium">Branch not found</p>
        <Link href="/merchant/branches">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />Back to Branches
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/merchant/branches/${id}`}>
          <Button variant="ghost" size="icon" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <PageHeader
          title={`Edit ${branch.name}`}
          description="Update branch information, location, hours, and status"
        />
      </div>

      <BranchForm
        isEdit
        initialValues={initialValues}
        errors={errors}
        submitting={updateBranch.isPending}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/merchant/branches/${id}`)}
      />
    </div>
  )
}
