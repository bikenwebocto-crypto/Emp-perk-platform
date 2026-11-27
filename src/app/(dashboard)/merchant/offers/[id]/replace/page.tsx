import { redirect } from 'next/navigation'

// Replacement flow retired: live offers are now changed by duplicating them.
export default async function ReplaceOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/merchant/offers/${id}/duplicate`)
}
