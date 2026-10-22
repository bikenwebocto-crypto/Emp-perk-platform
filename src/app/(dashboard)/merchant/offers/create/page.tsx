'use client'
import { use } from 'react'
import { OfferForm } from '@/features/merchant/offers/components/offer-form'

export default function CreateOfferPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  // ?flash=1 (from the Flash Offer tab) opens the form with Flash Offer ticked.
  const { flash } = use(searchParams)
  return <OfferForm initialData={flash === '1' ? { isFlash: true } : undefined} />
}
