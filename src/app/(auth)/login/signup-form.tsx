"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordRules } from "@/components/shared/password-rules";
import { getEmailError, getPasswordError } from "@/lib/validation/credentials";
import { isValidPhone } from "@/lib/phone";

type Values = Record<string, string>;
type Errors = Record<string, string>;

interface SignupFormProps {
  /** Called after the account is created; the parent signs the user in. */
  onCreated: (email: string, password: string) => Promise<void>;
  onBack: () => void;
}

const SOCIALS = ["instagram", "facebook", "twitter", "tiktok"] as const;
const URL_FIELDS = ["website", ...SOCIALS];
const CY_PREFIX = "+357";
const CY_DIGITS = 8;

/** "example.com" -> "https://example.com"; leaves http(s):// and empty values alone. */
const withHttps = (raw: string) => {
  const val = raw.trim();
  if (!val || /^https?:\/\//i.test(val)) return val;
  return `https://${val.replace(/^\/+/, "")}`;
};

/** Move the user to the first field with an error (opens collapsed sections). */
function revealFirstError(errs: Errors) {
  const ids = Object.keys(errs).filter((k) => errs[k]).map((k) => `su-${k}`);
  const first = Array.from(document.querySelectorAll<HTMLElement>("[id^='su-']")).find((el) => ids.includes(el.id));
  if (!first) return;
  const details = first.closest("details");
  if (details) details.open = true;
  requestAnimationFrame(() => {
    first.scrollIntoView({ behavior: "smooth", block: "center" });
    first.focus({ preventScroll: true });
  });
}

function Field({
  id, label, required, error, children,
}: { id: string; label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function SignupForm({ onCreated, onBack }: SignupFormProps) {
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (categories.length) return;
    fetch("/api/categories", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setCategories(Array.isArray(b?.data) ? b.data : []))
      .catch(() => setCategories([]));
  }, [categories.length]);

  // `current` lets handleSubmit validate the just-normalised values in the same tick.
  let current = values;
  const v = (k: string) => current[k] ?? "";
  const set = (k: string) => (e: { target: { value: string } }) => {
    setValues((prev) => ({ ...prev, [k]: e.target.value }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: "" }));
  };
  const text = (k: string, label: string, opts: { required?: boolean; type?: string; placeholder?: string } = {}) => {
    const isUrl = URL_FIELDS.includes(k);
    return (
      <Field id={`su-${k}`} label={label} required={opts.required} error={errors[k]}>
        <Input
          id={`su-${k}`}
          type={opts.type ?? "text"}
          placeholder={opts.placeholder}
          aria-invalid={!!errors[k]}
          value={v(k)}
          onChange={set(k)}
          onBlur={isUrl ? () => setValues((prev) => ({ ...prev, [k]: withHttps(prev[k] ?? "") })) : undefined}
        />
      </Field>
    );
  };

  const phoneDigits = v("contactPhone");
  const phoneWarning =
    phoneDigits && phoneDigits.length !== CY_DIGITS
      ? `Cyprus numbers have ${CY_DIGITS} digits (${phoneDigits.length}/${CY_DIGITS})`
      : "";

  const validate = (): Errors => {
    const e: Errors = {};
    const req = (k: string, label: string) => { if (!v(k).trim()) e[k] = `${label} is required`; };
    const emailErr = getEmailError(v("email"));
    if (emailErr) e.email = emailErr;
    const pwErr = getPasswordError(v("password"));
    if (pwErr) e.password = pwErr;
    if (v("password") !== v("confirmPassword")) e.confirmPassword = "Passwords do not match";
    const digits = v("contactPhone");
    if (digits) {
      if (digits.length !== CY_DIGITS) e.contactPhone = `Enter a ${CY_DIGITS}-digit Cyprus number`;
      else if (!isValidPhone(`${CY_PREFIX}${digits}`)) e.contactPhone = "Not a valid Cyprus phone number";
    }
    req("businessName", "Business name");
    req("contactName", "Contact name");
    for (const k of URL_FIELDS) {
      const val = withHttps(v(k));
      if (val && !/^https?:\/\/[^\s.]+\.\S+/.test(val)) e[k] = "Enter a valid web address, e.g. example.com";
    }
    return e;
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    // Auto-add https:// so the user doesn't have to type it.
    const normalized = { ...values };
    for (const k of URL_FIELDS) if (normalized[k]) normalized[k] = withHttps(normalized[k]);
    current = normalized;
    setValues(normalized);

    const found = validate();
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      setFormError("Please fix the highlighted fields.");
      revealFirstError(found);
      return;
    }

    const opt = (k: string) => v(k).trim() || null;
    const socialLinks = Object.fromEntries(SOCIALS.map((s) => [s, opt(s)]));
    const address = {
      addressLine1: opt("addressLine1"), addressLine2: opt("addressLine2"), city: opt("city"),
      state: opt("state"), postalCode: opt("postalCode"), country: opt("country"),
    };
    const base = { email: v("email").trim(), password: v("password"), website: opt("website"), socialLinks, ...address };
    const payload = {
      type: "MERCHANT" as const, ...base,
      businessName: v("businessName").trim(), contactName: v("contactName").trim(),
      contactPhone: v("contactPhone") ? `${CY_PREFIX}${v("contactPhone")}` : null, categoryId: opt("categoryId"), description: opt("description"),
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const details = body?.error?.details as Record<string, string[] | undefined> | undefined;
        if (details) {
          const mapped: Errors = {};
          for (const [k, msgs] of Object.entries(details)) if (msgs?.[0]) mapped[k === "phone" ? "contactPhone" : k] = msgs[0];
          setErrors((prev) => ({ ...prev, ...mapped }));
          revealFirstError(mapped);
        }
        setFormError(body?.error?.message ?? "Sign-up failed. Please try again.");
        return;
      }
      await onCreated(payload.email, payload.password);
    } catch {
      setFormError("Sign-up failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const backLink = (
    <p className="text-center text-sm text-gray-600">
      Already have an account?{" "}
      <button type="button" className="font-medium text-blue-600 hover:underline" disabled={submitting} onClick={onBack}>
        Sign in
      </button>
    </p>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <h2 className="text-lg font-semibold">Sign up as Merchant</h2>
      {formError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>}

      <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
        <>
            {text("businessName", "Business name", { required: true })}
            {text("contactName", "Contact name", { required: true })}
            <Field id="su-contactPhone" label="Contact phone (Cyprus)" error={errors.contactPhone}>
              <div className="flex">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-gray-50 px-3 text-sm text-gray-600">
                  🇨🇾 {CY_PREFIX}
                </span>
                <Input
                  id="su-contactPhone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="99123456"
                  maxLength={CY_DIGITS}
                  className="rounded-l-none"
                  aria-invalid={!!errors.contactPhone}
                  value={phoneDigits}
                  onChange={(e) => {
                    // Digits only; drop a pasted +357 / 00357 prefix.
                    const digits = e.target.value.replace(/\D/g, "").replace(/^(00)?357(?=\d{8})/, "").slice(0, CY_DIGITS);
                    set("contactPhone")({ target: { value: digits } });
                  }}
                />
              </div>
              {!errors.contactPhone && (
                phoneWarning
                  ? <p className="text-xs text-amber-600">{phoneWarning}</p>
                  : <p className="text-xs text-gray-500">{CY_DIGITS}-digit Cyprus number, e.g. 99123456</p>
              )}
            </Field>
            <Field id="su-categoryId" label="Category" error={errors.categoryId}>
              <select
                id="su-categoryId"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={v("categoryId")}
                onChange={set("categoryId")}
              >
                <option value="">Select a category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field id="su-description" label="Description" error={errors.description}>
              <textarea
                id="su-description"
                rows={3}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={v("description")}
                onChange={set("description")}
              />
            </Field>
        </>

        {text("website", "Website", { placeholder: "https://" })}
        <details className="rounded-md border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">Social links</summary>
          <div className="mt-3 space-y-3">
            {SOCIALS.map((s) => text(s, s.charAt(0).toUpperCase() + s.slice(1), { placeholder: "https://" }))}
          </div>
        </details>
        <details className="rounded-md border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">Address</summary>
          <div className="mt-3 space-y-3">
            {text("addressLine1", "Address line 1")}
            {text("addressLine2", "Address line 2")}
            <div className="grid grid-cols-2 gap-3">
              {text("city", "City")}
              {text("state", "State / Region")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {text("postalCode", "Postal code")}
              {text("country", "Country")}
            </div>
          </div>
        </details>

        <hr />
        {text("email", "Email address", { required: true, type: "email" })}
        <Field id="su-password" label="Password" required error={errors.password}>
          <Input id="su-password" type="password" autoComplete="new-password" value={v("password")} onChange={set("password")} />
          <PasswordRules password={v("password")} />
        </Field>
        {text("confirmPassword", "Confirm password", { required: true, type: "password" })}
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create account
      </Button>
      {backLink}
    </form>
  );
}
