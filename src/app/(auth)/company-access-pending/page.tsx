import { Building2 } from 'lucide-react'
import { LoginLayoutRenderer } from '@/components/login-layouts'
import { getPublicBranding } from '@/features/admin/settings/login-branding/services/login-branding.service'
import { COMPANY_ACCESS_PENDING_MESSAGE } from '@/lib/access/company-access'

export default async function CompanyAccessPendingPage() {
  const branding = await getPublicBranding()

  return (
    <LoginLayoutRenderer branding={branding}>
      <div className="w-full max-w-sm rounded-lg border bg-background p-6 text-center">
        <Building2 className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden="true" />
        <h1 className="text-lg font-semibold">Approved: awaiting payment</h1>
        <p className="mt-2 text-sm text-muted-foreground">{COMPANY_ACCESS_PENDING_MESSAGE}</p>
      </div>
    </LoginLayoutRenderer>
  )
}
