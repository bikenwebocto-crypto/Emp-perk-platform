"use client";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
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
  const searchParams = useSearchParams();
  const [view, setView] = useState<'sign_in' | 'sign_up' | 'update_password'>(
    () => (searchParams.get("mode") === "signup" ? "sign_up" : "sign_in"),
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

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setEmailTouched(true);
    if (emailError) return;
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
    // If email confirmation is off, Supabase returns a session and
    // onAuthStateChange(SIGNED_IN) runs the sync + redirect. Otherwise the
    // confirmation link brings the user back to /login signed in.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (!data.session) {
      setNotice("Check your email for a confirmation link to finish creating your account.");
      setView("sign_in");
    }
  };

  const switchView = (next: "sign_in" | "sign_up") => {
    setError(null);
    setNotice(null);
    setPassword("");
    setConfirmPassword("");
    setView(next);
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
    setMounted(true);

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
    console.log('supabase register list:', supabase.auth.mfa.listFactors());
    
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
      if (event === "PASSWORD_RECOVERY") setView("update_password");
      if (event === "SIGNED_IN") {
        if (inviteRef.current) setView("update_password");
        else onAuth();
      }
      if (event === "USER_UPDATED" && inviteRef.current) {
        inviteRef.current = false;
        onAuth();
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
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            providers={[]}
            redirectTo="/login"
            view={view}
          />
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
                onClick={() => switchView("sign_up")}
              >
                Sign up
              </button>
            </p>
          </form>
        )}
        {mounted && view === "sign_up" && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="signup-email" className="text-sm font-medium">
                Email address
              </label>
              <Input
                id="signup-email"
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
              <label htmlFor="signup-password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordRules password={password} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="signup-confirm" className="text-sm font-medium">
                Confirm password
              </label>
              <Input
                id="signup-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !!getPasswordError(password) || password !== confirmPassword}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create account
            </Button>
            <p className="text-center text-sm text-gray-600">
              Already have an account?{" "}
              <button
                type="button"
                className="font-medium text-blue-600 hover:underline"
                onClick={() => switchView("sign_in")}
              >
                Sign in
              </button>
            </p>
          </form>
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
