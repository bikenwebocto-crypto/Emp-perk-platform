'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase/client';

interface RecoveryRequest {
  id: string;
  recoveryType: 'STANDARD' | 'SUPER_ADMIN_EMERGENCY';
  status: string;
  otpSentAt: string | null;
  rejectionReason: string | null;
}

interface ApiError {
  code: string;
  message: string;
  remainingAttempts?: number;
  retryAfterSeconds?: number;
}

const STATUS_COPY: Record<string, string> = {
  PENDING: 'Your request was submitted. A Super Admin will review it and may call your registered phone number.',
  UNDER_REVIEW: 'A Super Admin is reviewing your request. You will receive a code by email once they have verified you.',
  OTP_VERIFIED: 'Your email is verified. Your request is waiting for approval.',
  APPROVED: 'Your request was approved. Your old authenticator is being removed.',
  AWAITING_NEW_MFA: 'Your old authenticator was removed. Sign in again to register a new authenticator app.',
  COMPLETED: 'Recovery is complete. Your new authenticator is active.',
  REJECTED: 'Your recovery request was rejected.',
  EXPIRED: 'Your recovery request expired. You can submit a new one.',
  FAILED: 'Your recovery request could not be completed. Contact support.',
};

const CLOSED = ['COMPLETED', 'REJECTED', 'EXPIRED', 'FAILED'];

async function call<T>(url: string, init?: RequestInit): Promise<{ data?: T; error?: ApiError }> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    return { error: body.error ?? { code: 'ERROR', message: 'Request failed.' } };
  }
  return { data: body.data as T };
}

export function MfaRecoveryClient() {
  const [request, setRequest] = useState<RecoveryRequest | null>(null);
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await call<RecoveryRequest | null>('/api/mfa/recovery/me');
    if (loadError) setError(loadError.message);
    setRequest(data ?? null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<{ data?: unknown; error?: ApiError }>, success?: string) => {
    setError('');
    setNotice('');
    setIsSubmitting(true);
    const { error: actionError } = await action();
    if (actionError) {
      const extra = actionError.remainingAttempts !== undefined
        ? ` ${actionError.remainingAttempts} attempt(s) left.`
        : actionError.retryAfterSeconds
          ? ` Try again in ${actionError.retryAfterSeconds}s.`
          : '';
      setError(actionError.message + extra);
    } else if (success) {
      setNotice(success);
      setCode('');
    }
    await load();
    setIsSubmitting(false);
  };

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(() => call('/api/mfa/recovery/request', { method: 'POST', body: JSON.stringify({ reason }) }));
  };

  const verifyCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(
      () => call('/api/mfa/recovery/verify-otp', { method: 'POST', body: JSON.stringify({ code }) }),
      'Email verified.',
    );
  };

  const resend = () => void run(() => call('/api/mfa/recovery/resend-otp', { method: 'POST' }), 'A new code was sent to your email.');

  const signInAgain = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const showForm = !request || CLOSED.includes(request.status);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4 py-12">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Recover authenticator access</h1>
        <p className="mt-2 text-sm text-slate-600">
          If you lost the phone or app that generates your sign-in codes, request a reset. We verify you by email and an
          administrator must approve before your old authenticator is removed. Never share email codes with anyone.
        </p>

        {error && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        {notice && (
          <div className="mt-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>
        )}

        {isLoading ? (
          <div className="mt-6 text-sm text-slate-500">Loading…</div>
        ) : (
          <div className="mt-6 space-y-4">
            {request && STATUS_COPY[request.status] && request.status !== 'OTP_SENT' && (
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {STATUS_COPY[request.status]}
                {request.status === 'REJECTED' && request.rejectionReason && (
                  <span className="mt-1 block">Reason: {request.rejectionReason}</span>
                )}
              </div>
            )}

            {request?.status === 'OTP_SENT' && (
              <form onSubmit={verifyCode} className="space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Enter the 6-digit code we emailed to your registered address
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value.trim())}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoComplete="one-time-code"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-slate-500"
                    placeholder="123456"
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSubmitting || code.length !== 6}
                  className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isSubmitting ? 'Verifying…' : 'Verify email code'}
                </button>
                <button
                  type="button"
                  onClick={resend}
                  disabled={isSubmitting}
                  className="w-full text-sm font-medium text-slate-700 underline disabled:text-slate-400"
                >
                  Send a new code
                </button>
              </form>
            )}

            {request?.status === 'AWAITING_NEW_MFA' && (
              <button
                type="button"
                onClick={() => void signInAgain()}
                className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Sign in and register a new authenticator
              </button>
            )}

            {showForm && (
              <form onSubmit={submitRequest} className="space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Why do you need to reset your authenticator?
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    minLength={10}
                    maxLength={1000}
                    rows={4}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-slate-500"
                    placeholder="e.g. My phone was lost and I no longer have the authenticator app."
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSubmitting || reason.trim().length < 10}
                  className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isSubmitting ? 'Submitting…' : 'Request recovery'}
                </button>
              </form>
            )}

            <a href="/mfa/verify" className="block text-center text-sm text-slate-600 underline">
              Back to code verification
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
