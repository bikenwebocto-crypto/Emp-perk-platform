'use client'
import { use } from 'react'
import { useMerchantOfferById } from '@/hooks/queries/use-merchant-offers'
import { OfferForm } from '@/features/merchant/offers/components/offer-form'
import { offerToFormData } from '@/features/merchant/offers/offer-to-form-data'
import { Skeleton } from '@/components/ui/skeleton'

// Duplicate: pre-fills the form with an existing offer's details but creates a
// brand-new offer (no offerId, no replacesOfferId). The original stays as it is;
// the copy goes through the normal submit → admin approval flow.
export default function DuplicateOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading, error } = useMerchantOfferById(id)

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>

  if (error || !data?.data) return <p className="py-12 text-center text-muted-foreground">Offer not found</p>

  const base = offerToFormData(data.data)

  return (
    <OfferForm
      initialData={{
        ...base,
        title: base.title ? `${base.title} (copy)` : '',
        // Start fresh on scheduling so the copy isn't backdated.
        startDate: '',
        endDate: '',
        // Codes must be unique per offer; the merchant sets a new one.
        redemptionCode: '',
        submissionNotes: '',
      }}
    />
  )
}
