import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { MfaRecoveryClient } from './mfa-recovery-client';

export default async function MfaRecoveryPage() {
  const supabaseServer = await createClient();
  const { data: { user } } = await supabaseServer.auth.getUser();

  if (!user) redirect('/login?redirectTo=/mfa/recovery');

  return (
    <Suspense>
      <MfaRecoveryClient />
    </Suspense>
  );
}
