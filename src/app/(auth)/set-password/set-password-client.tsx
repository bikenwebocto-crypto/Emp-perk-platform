"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { clearClientSession } from "@/lib/auth/clear-client-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoginLayoutRenderer } from "@/components/login-layouts";
import { PasswordRules } from "@/components/shared/password-rules";
import { getPasswordError } from "@/lib/validation/credentials";
import type { PublicBranding } from "@/features/admin/settings/login-branding/services/login-branding.service";

interface SetPasswordClientProps {
  branding: PublicBranding;
}

export function SetPasswordClient({ branding }: SetPasswordClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The invite link already verified the token and set a session cookie.
  // Without a session the link was invalid or the page was opened directly.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login?error=link_invalid");
        return;
      }
      setEmail(data.user.email ?? null);
      setChecking(false);
    });
  }, [router]);

  const passwordError = getPasswordError(password);
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (passwordError) return setError(passwordError);
    if (password !== confirmPassword) return setError("Passwords do not match.");

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      // Drop the one-time invite session; the user signs in with the new password.
      await supabase.auth.signOut();
      clearClientSession(queryClient);
      const params = new URLSearchParams({ notice: "password_set" });
      if (email) params.set("email", email);
      router.replace(`/login?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set password.");
      setSubmitting(false);
    }
  };

  return (
    <LoginLayoutRenderer branding={{ ...branding, heading: "Set your password", description: email ? `Choose a password for ${email}` : "Choose a password for your account" }}>
      {error && (
        <div className="mb-4 flex w-full items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="w-full max-w-sm">
        {checking ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="set-password" className="text-sm font-medium">
                Password
              </label>
              <div className="relative">
                <Input
                  id="set-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordRules password={password} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="set-password-confirm" className="text-sm font-medium">
                Confirm password
              </label>
              <Input
                id="set-password-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                aria-invalid={mismatch}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {mismatch && <p className="text-xs text-red-600">Passwords do not match.</p>}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !!passwordError || password !== confirmPassword}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Set password
            </Button>
          </form>
        )}
      </div>
    </LoginLayoutRenderer>
  );
}
