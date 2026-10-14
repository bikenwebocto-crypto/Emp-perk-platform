import { getPublicBranding } from '@/features/admin/settings/login-branding/services/login-branding.service'
import { Suspense } from 'react'
import { LoginClient } from './login-client'

export default async function LoginPage() {
  const branding = await getPublicBranding()

  // LoginClient reads ?email= via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <LoginClient branding={branding} />
    </Suspense>
  )
}
