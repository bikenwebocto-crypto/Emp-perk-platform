'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export function MfaVerifyClient() {
  const router = useRouter();
  const didInitializeRef = useRef(false);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (didInitializeRef.current) return;
    didInitializeRef.current = true;

    const loadFactor = async () => {
      try {
        const { data, error: factorsError } = await supabase.auth.mfa.listFactors();

        if (factorsError) {
          throw factorsError;
        }

        const verifiedTotpFactor = (data?.all ?? []).find(
          (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
        );

        if (!verifiedTotpFactor) {
          router.replace('/mfa/setup');
          return;
        }

        setFactorId(verifiedTotpFactor.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load MFA factor.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadFactor();
  }, [router]);

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    setIsVerifying(true);

    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) {
        throw challengeError;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });

      if (verifyError) {
        throw verifyError;
      }

      router.replace('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setIsSubmitting(false);
      setIsVerifying(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4 py-12">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Verify your authenticator code</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter the 6-digit code from your authenticator app to continue to the dashboard.
        </p>

        {error && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="mt-6 text-sm text-slate-500">Loading verification…</div>
        ) : (
          <form onSubmit={handleVerify} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              6-digit code
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.trim())}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-slate-500"
                placeholder="123456"
                required
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting || !factorId}
              className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isVerifying ? 'Verifying code…' : isSubmitting ? 'Sending request…' : 'Verify code'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
