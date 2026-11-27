'use client'
import { use } from 'react'
import { useMerchantOfferById } from '@/hooks/queries/use-merchant-offers'
import { OfferForm } from '@/features/merchant/offers/components/offer-form'
import { offerToFormData } from '@/features/merchant/offers/offer-to-form-data'
import { Skeleton } from '@/components/ui/skeleton'

export default function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading, error } = useMerchantOfferById(id)

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>

  if (error || !data?.data) return <p className="py-12 text-center text-muted-foreground">Offer not found</p>

  return <OfferForm offerId={id} initialData={offerToFormData(data.data)} />
}
