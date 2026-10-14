import { Suspense } from 'react'
import { CompanyForm } from '@/features/companies/components/company-form'

export default function AddCompanyPage() {
  return (
    <div className="py-6">
      {/* CompanyForm reads ?leadId= via useSearchParams */}
      <Suspense>
        <CompanyForm />
      </Suspense>
    </div>
  )
}
