'use client'
import { use } from 'react'
import { useMerchantOfferById } from '@/hooks/queries/use-merchant-offers'
import { OfferForm } from '@/features/merchant/offers/components/offer-form'
import { Skeleton } from '@/components/ui/skeleton'

export default function ReplaceOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading, error } = useMerchantOfferById(id)

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>

  if (error || !data?.data) return <p className="py-12 text-center text-muted-foreground">Offer not found</p>

  const offer = data.data

  return (
    <OfferForm
      isReplacement
      currentLiveOffer={{ id: offer.id, title: offer.title }}
      initialData={{
        offerType: offer.offerType ?? 'FLAT',
      }}
    />
  )
}
