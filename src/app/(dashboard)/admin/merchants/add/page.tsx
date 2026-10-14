import { Suspense } from 'react'
import { MerchantForm } from '@/features/merchants/components/merchant-form'

export default function AddMerchantPage() {
  return (
    <div className="py-6">
      {/* MerchantForm reads ?leadId= via useSearchParams */}
      <Suspense>
        <MerchantForm />
      </Suspense>
    </div>
  )
}
