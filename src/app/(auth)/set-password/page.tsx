import { Suspense } from 'react'
import { getPublicBranding } from '@/features/admin/settings/login-branding/services/login-branding.service'
import { SetPasswordClient } from './set-password-client'

// ON-14: invited users land here (via /auth/invite or /auth/confirm) with a
// one-time session and choose their first password.
export default async function SetPasswordPage() {
  const branding = await getPublicBranding()
  return (
    <Suspense>
      <SetPasswordClient branding={branding} />
    </Suspense>
  )
}
