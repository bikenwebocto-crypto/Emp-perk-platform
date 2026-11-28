"use client";
import { supabase } from "@/lib/supabase/client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { clearClientSession } from "@/lib/auth/clear-client-session";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoginLayoutRenderer } from "@/components/login-layouts";
import { requiresMfaForRole } from "@/lib/auth/mfa";
import type { PublicBranding } from "@/features/admin/settings/login-branding/services/login-branding.service";
import { getEmailError, getPasswordError } from "@/lib/validation/credentials";
import { PasswordRules } from "@/components/shared/password-rules";
import { SignupForm } from "./signup-form";

interface LoginClientProps {
  branding: PublicBranding;
}

export function LoginClient({ branding }: LoginClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const syncedRef = useRef(false);
  // Invite links (bulk employee upload) must set a password before the
  // account is synced and redirected.
  const inviteRef = useRef(false);
  // Password-reset links sign the user in at AAL1. They must not be synced /
  // redirected until the new password is saved (which needs AAL2 if MFA is on).
  // Set either by the legacy hash link or by /auth/confirm (?flow=recovery).
  const recoveryRef = useRef(
    typeof window !== "undefined" &&
      (window.location.hash.includes("type=recovery") ||
        new URLSearchParams(window.location.search).get("flow") === "recovery"),
  );
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const searchParams = useSearchParams();
  // ?mode=signup opens the self sign-up (merchant only) view.
  const [view, setView] = useState<'sign_in' | 'sign_up' | 'update_password'>(
    searchParams.get("mode") === "signup" ? "sign_up" : "sign_in",
  );
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Sign-in/sign-up form. The Supabase Auth widget can't take a default email,
  // so it uses a small form pre-filled from ?email= (invite links).
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const emailError = getEmailError(email);
  const showEmailError = emailTouched && emailError;

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setEmailTouched(true);
    if (emailError) return;
    setSubmitting(true);
    // On success, onAuthStateChange(SIGNED_IN) runs the sync + redirect.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError) setError(signInError.message);
  };

  // Self sign-up creates an already-approved merchant / company account; we then
  // sign in with the new credentials and the SIGNED_IN handler syncs + redirects.
  const handleSignupCreated = async (newEmail: string, newPassword: string) => {
    setEmail(newEmail);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: newEmail,
      password: newPassword,
    });
    if (signInError) {
      setView("sign_in");
      setNotice("Your account was created. Please sign in to continue.");
    }
  };

  const switchView = (next: "sign_in" | "sign_up") => {
    setError(null);
    setNotice(null);
    setPassword("");
    setConfirmPassword("");
    setView(next);
  };

  const handleUpdatePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const passwordError = getPasswordError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      // With MFA enrolled, Supabase only allows a password change from an AAL2 session.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        let factorId = mfaFactorId;
        if (!factorId) {
          const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
          if (factorsError) throw factorsError;
          factorId = factors?.totp?.[0]?.id ?? null;
          if (!factorId) throw new Error("No verified MFA factor found. Contact an administrator.");
          setMfaFactorId(factorId);
          // Ask for the code before going further.
          if (!mfaCode) {
            setNotice("Enter the 6-digit code from your authenticator app to confirm the password change.");
            return;
          }
        }
        if (!/^\d{6}$/.test(mfaCode)) throw new Error("Enter the 6-digit code from your authenticator app.");
        const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
          factorId,
          code: mfaCode,
        });
        if (verifyError) throw verifyError;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setPassword("");
      setConfirmPassword("");
      setMfaCode("");
      setMfaFactorId(null);
      setNotice("Your password has been updated.");
      window.history.replaceState(null, "", window.location.pathname);
      if (inviteRef.current) {
        // Invited users sign in themselves with the password they just set.
        inviteRef.current = false;
        await supabase.auth.signOut();
        clearClientSession(queryClient);
        setView("sign_in");
        setNotice("Your password has been set. Please sign in to continue.");
      } else if (recoveryRef.current) {
        recoveryRef.current = false;
        onAuth();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setSubmitting(false);
    }
  };

  // Leave the invite / reset flow: drop its temporary session and show sign-in.
  const handleBackToSignIn = async () => {
    inviteRef.current = false;
    recoveryRef.current = false;
    await supabase.auth.signOut();
    clearClientSession(queryClient);
    window.history.replaceState(null, "", window.location.pathname);
    setMfaFactorId(null);
    setMfaCode("");
    switchView("sign_in");
  };

  const handleForgotPassword = async () => {
    setError(null);
    setNotice(null);
    setEmailTouched(true);
    if (emailError) return;
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setSubmitting(false);
    if (resetError) setError(resetError.message);
    else setNotice("If an account exists for this email, a password reset link has been sent.");
  };

  useEffect(() => {
    if (searchParams.get("mfa_required") === "1") {
      setError("This admin account requires MFA verification before dashboard access.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("error") === "link_invalid") {
      setError("This link is invalid, expired or already used. Please request a new one.");
    }
    if (searchParams.get("notice") === "password_set") {
      setNotice("Your password has been set. Please sign in to continue.");
    }
  }, [searchParams]);

  useEffect(() => {
    setMounted(true);

    // Old PKCE email links (?code=) land here. Let the server route exchange
    // the code and redirect back with a clear result.
    const query = new URLSearchParams(window.location.search)
    const code = query.get('code')
    if (code) {
      window.location.replace(`/auth/confirm?${query.toString()}`)
      return
    }

    // /auth/confirm already verified the link and set the session cookie.
    if (query.get('mode') === 'update_password') {
      const flow = query.get('flow')
      inviteRef.current = flow === 'invite'
      recoveryRef.current = flow === 'recovery'
      setView('update_password')
      return
    }

    const hash = window.location.hash
    inviteRef.current = hash.includes('type=invite')
    if (!hash.includes('type=recovery') && !inviteRef.current) return

    const params = new URLSearchParams(hash.substring(1))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (!access_token || !refresh_token) return
    
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (!error) setView('update_password')
    })
  }, []);

  const onAuth = useCallback(async () => {
    if (syncedRef.current || isSyncing) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    // console.log("User signed in, syncing with backend...", session.access_token);
    syncedRef.current = true;
    setIsSyncing(true);

    try {
      const res = await fetch("/api/auth/sync-admin", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const body = await res.json();

    if (!res.ok) {
        const errorMessage =
          body?.error?.code === "EMAIL_ALREADY_EXISTS"
            ? "This email is already assigned to another account."
            : body?.error?.message ||
              "Something went wrong. Please try again.";

        const isEmployeeBlocked =
          body?.error?.code === "EMPLOYEE_WEB_ACCESS_BLOCKED";

        // Employees must use the mobile app — drop the web session entirely.
        if (isEmployeeBlocked) {
          await supabase.auth.signOut();
          clearClientSession(queryClient);
        }

        setError(errorMessage);

        window.setTimeout(() => {
          setError("");
        }, isEmployeeBlocked ? 10000 : 5000);

        syncedRef.current = false;
        setIsSyncing(false);

        return;
      }
      const role = body?.role;
      const redirectPath = requiresMfaForRole(role)
        ? (body.redirectTo || "/mfa/setup")
        : (body.redirectTo || "/login");
      // Start the new session from the server's view of the user, not from
      // whatever the previous session left in the client cache.
      clearClientSession(queryClient);
      router.push(redirectPath);
      router.refresh();
    } catch {
      setError("Failed to verify your account. Please try again.");
      syncedRef.current = false;
      setIsSyncing(false);
      setTimeout(() => setError(""), 5000);
    }
  }, [router, isSyncing]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryRef.current = true;
        setView("update_password");
      }
      if (event === "SIGNED_IN") {
        if (inviteRef.current || recoveryRef.current) setView("update_password");
        else onAuth();
      }
    });
    return () => subscription.unsubscribe();
  }, [onAuth]);

  if (isSyncing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="mx-4 max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <div className="relative mx-auto mb-6 h-20 w-20">
            <div className="absolute inset-0 rounded-full border-4 border-blue-200" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-t-blue-600 border-r-transparent border-b-transparent border-l-transparent" />
            <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-pulse text-blue-600" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-gray-900">Verifying Your Account</h3>
          <p className="mb-4 text-sm text-gray-600">Please wait while we set up your dashboard access...</p>
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-1.5 rounded-full bg-blue-600"
              style={{ width: "60%", animation: "progress 3s ease-in-out infinite" }}
            />
          </div>
          <p className="text-xs text-gray-500">This may take a few seconds</p>
        </div>
      </div>
    );
  }

  return (
    <LoginLayoutRenderer branding={branding}>
      {error && (
        <div className="mb-4 flex w-full items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="mb-4 w-full rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {notice}
        </div>
      )}
      <div className="w-full max-w-sm">
        {mounted && view === "update_password" && (
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-sm font-medium">
                New password
              </label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordRules password={password} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-password-confirm" className="text-sm font-medium">
                Confirm new password
              </label>
              <Input
                id="new-password-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {mfaFactorId && (
              <div className="space-y-1.5">
                <label htmlFor="reset-mfa-code" className="text-sm font-medium">
                  Authenticator code
                </label>
                <Input
                  id="reset-mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !!getPasswordError(password) || password !== confirmPassword}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mfaFactorId ? "Verify & update password" : "Update password"}
            </Button>
            <p className="text-center text-sm text-gray-600">
              Remembered your password?{" "}
              <button
                type="button"
                className="font-medium text-blue-600 hover:underline"
                disabled={submitting}
                onClick={handleBackToSignIn}
              >
                Back to sign in
              </button>
            </p>
          </form>
        )}
        {mounted && view === "sign_in" && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-sm font-medium">
                Email address
              </label>
              <Input
                id="login-email"
                type="text"
                inputMode="email"
                autoComplete="email"
                aria-invalid={!!showEmailError}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
              />
              {showEmailError && <p className="text-xs text-red-600">{emailError}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
            <Button
              type="button"
              variant="link"
              className="w-full"
              disabled={submitting}
              onClick={handleForgotPassword}
            >
              Forgot password?
            </Button>
            <p className="text-center text-sm text-gray-600">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="font-medium text-blue-600 hover:underline"
                disabled={submitting}
                onClick={() => switchView("sign_up")}
              >
                Sign up
              </button>
            </p>
          </form>
        )}
        {mounted && view === "sign_up" && (
          <SignupForm onCreated={handleSignupCreated} onBack={() => switchView("sign_in")} />
        )}
      </div>
    </LoginLayoutRenderer>
  );
}

const styles = `
  @keyframes progress {
    0% { width: 10%; margin-left: 0; }
    50% { width: 80%; margin-left: 10%; }
    100% { width: 95%; margin-left: 5%; }
  }
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
