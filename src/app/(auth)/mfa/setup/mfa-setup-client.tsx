'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export function MfaSetupClient() {
  const router = useRouter();
  const didInitializeRef = useRef(false);
  const [qrCode, setQrCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (didInitializeRef.current) return;
    didInitializeRef.current = true;

    const loadFactor = async () => {
      try {
        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) {
          throw factorsError;
        }

        const verifiedFactor = (factorsData?.all ?? []).find(
          (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
        );

        if (verifiedFactor) {
          router.replace('/mfa/verify');
          return;
        }

        const existingUnverifiedFactor = (factorsData?.all ?? []).find(
          (factor) => factor.factor_type === 'totp' && factor.status === 'unverified',
        );

        if (existingUnverifiedFactor) {
          const { error: unenrollError } = await supabase.auth.mfa.unenroll({
            factorId: existingUnverifiedFactor.id,
          });

          if (unenrollError) {
            throw unenrollError;
          }
        }

        const { data, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Admin Authenticator',
        });

        if (enrollError) {
          throw enrollError;
        }

        const qr = data?.totp?.qr_code ?? '';
        const factorKey = data?.id ?? '';

        if (!qr || !factorKey) {
          throw new Error('MFA QR code was not returned by Supabase.');
        }

        setFactorId(factorKey);
        setQrCode(qr);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to enroll MFA.');
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
    }
  };
  const qrSrc = qrCode.startsWith('data:')
    ? qrCode
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode)}`;
  return (
    <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4 py-12">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Set up MFA</h1>
        <p className="mt-2 text-sm text-slate-600">
          Scan this QR code with your authenticator app to enable TOTP for privileged access.
        </p>

        {error && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="mt-6 text-sm text-slate-500">Loading authenticator setup…</div>
        ) :  (
          <>
            {qrCode ? (
              <div className="mt-6 flex justify-center rounded-xl border border-slate-200 bg-slate-50 p-4">
                <img src={qrSrc} alt="Scan with authenticator" width={200} height={200} />
              </div>
            ) : null}

            <form onSubmit={handleVerify} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                6-digit code from your authenticator
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
                disabled={isSubmitting || !factorId || !qrCode}
                className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting ? 'Verifying…' : 'Verify and continue'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
