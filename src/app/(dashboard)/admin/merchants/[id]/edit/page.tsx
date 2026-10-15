'use client'
import { use } from 'react'
import { useMerchantById } from '@/hooks/queries/use-merchants'
import { MerchantForm } from '@/features/merchants/components/merchant-form'
import { Skeleton } from '@/components/ui/skeleton'

export default function EditMerchantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading, error } = useMerchantById(id)

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>

  if (error || !data?.data) return <p className="py-12 text-center text-muted-foreground">Merchant not found</p>

  const merchant = data.data
  return (
    <MerchantForm
      merchantId={id}
      initialData={{
        businessName: merchant.businessName ?? '',
        email: merchant?.account?.email ?? '',
        // password: '',
        contactName: merchant.contactName ?? '',
        contactPhone: merchant.contactPhone ?? '',
        categoryId: merchant.categoryId ?? '',
        description: merchant.description ?? '',
        website: merchant.website ?? '',
        socialLinks: (merchant.socialLinks ?? {}) as any,
        logoUrl: merchant.logoUrl ?? '',
        coverImageUrl: merchant.coverImageUrl ?? '',
        addressLine1: merchant.addressLine1 ?? '',
        addressLine2: merchant.addressLine2 ?? '',
        city: merchant.city ?? '',
        state: merchant.state ?? '',
        postalCode: merchant.postalCode ?? '',
        country: merchant.country ?? '',
      }}
    />
  )
}
