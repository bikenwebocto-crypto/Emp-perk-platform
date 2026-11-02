import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { MfaVerifyClient } from './mfa-verify-client';

export default async function MfaVerifyPage() {
  const supabaseServer = await createClient();
  const { data: { user } } = await supabaseServer.auth.getUser();

  if (!user) redirect('/login');

  const { data: assurance } = await supabaseServer.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel === 'aal2') redirect('/admin');

  return (
    <Suspense>
      <MfaVerifyClient />
    </Suspense>
  );
}
