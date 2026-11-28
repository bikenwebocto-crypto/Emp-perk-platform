'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { showToast } from '@/hooks/use-toast'
import { BranchForm, valuesToPayload, type BranchFormValues } from '@/components/merchant/branches/BranchForm'
import { useCreateBranch, useMerchantBranches } from '@/hooks/queries/use-merchant-branches'

export default function NewBranchPage() {
  const router = useRouter()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const createBranch = useCreateBranch()
  const { data: existingData } = useMerchantBranches()
  const existingOnlineCount = ((existingData?.data ?? []) as any[]).filter(
    (b) => b.branchType === 'ONLINE' && b.deletedAt == null
  ).length

  async function handleSubmit(values: BranchFormValues) {
    setErrors({})
    if (values.branchType === 'ONLINE' && existingOnlineCount > 0) {
      showToast({ type: 'error', title: 'You already have an ONLINE branch. Edit it instead.' })
      return
    }
    try {
      const payload = valuesToPayload(values)
      const result = await createBranch.mutateAsync(payload as any)
      showToast({ type: 'success', title: 'Branch created', description: result?.message })
      router.push(`/merchant/branches/${result.data.id}`)
    } catch (e: any) {
      if (e.details) {
        setErrors(e.details)
        showToast({ type: 'error', title: 'Validation failed', description: e.message })
      } else {
        showToast({ type: 'error', title: 'Failed to create branch', description: e.message })
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/merchant/branches">
          <Button variant="ghost" size="icon" aria-label="Back to branches">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <PageHeader
          title="Add Branch"
          description="Create a new in-store or online branch"
        />
      </div>

      <BranchForm
        errors={errors}
        submitting={createBranch.isPending}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/merchant/branches')}
      />
    </div>
  )
}
