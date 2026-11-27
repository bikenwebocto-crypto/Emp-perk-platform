"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Building2, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordRules } from "@/components/shared/password-rules";
import { getEmailError, getPasswordError } from "@/lib/validation/credentials";
import { isValidPhone } from "@/lib/phone";

type SignupType = "MERCHANT" | "COMPANY";
type Values = Record<string, string>;
type Errors = Record<string, string>;

interface SignupFormProps {
  /** Called after the account is created; the parent signs the user in. */
  onCreated: (email: string, password: string) => Promise<void>;
  onBack: () => void;
}

const SOCIALS = ["instagram", "facebook", "twitter", "tiktok"] as const;

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
  const [type, setType] = useState<SignupType | null>(null);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (type !== "MERCHANT" || categories.length) return;
    fetch("/api/categories")
      .then((r) => r.json())
      .then((b) => setCategories(Array.isArray(b?.data) ? b.data : []))
      .catch(() => setCategories([]));
  }, [type, categories.length]);

  const v = (k: string) => values[k] ?? "";
  const set = (k: string) => (e: { target: { value: string } }) => {
    setValues((prev) => ({ ...prev, [k]: e.target.value }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: "" }));
  };
  const text = (k: string, label: string, opts: { required?: boolean; type?: string; placeholder?: string } = {}) => (
    <Field id={`su-${k}`} label={label} required={opts.required} error={errors[k]}>
      <Input
        id={`su-${k}`}
        type={opts.type ?? "text"}
        placeholder={opts.placeholder}
        aria-invalid={!!errors[k]}
        value={v(k)}
        onChange={set(k)}
      />
    </Field>
  );

  const validate = (): Errors => {
    const e: Errors = {};
    const req = (k: string, label: string) => { if (!v(k).trim()) e[k] = `${label} is required`; };
    const emailErr = getEmailError(v("email"));
    if (emailErr) e.email = emailErr;
    const pwErr = getPasswordError(v("password"));
    if (pwErr) e.password = pwErr;
    if (v("password") !== v("confirmPassword")) e.confirmPassword = "Passwords do not match";
    const phoneKey = type === "MERCHANT" ? "contactPhone" : "phone";
    if (v(phoneKey).trim() && !isValidPhone(v(phoneKey))) e[phoneKey] = "Invalid phone number";
    if (type === "MERCHANT") {
      req("businessName", "Business name");
      req("contactName", "Contact name");
    } else {
      req("name", "Company name");
      req("firstName", "First name");
      req("lastName", "Last name");
      if (v("employeeCount") && !/^\d+$/.test(v("employeeCount"))) e.employeeCount = "Enter a whole number";
    }
    for (const k of ["website", ...SOCIALS]) {
      const val = v(k).trim();
      if (val && !/^https?:\/\/\S+\.\S+/.test(val)) e[k] = "Enter a full URL (https://…)";
    }
    return e;
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    const opt = (k: string) => v(k).trim() || null;
    const socialLinks = Object.fromEntries(SOCIALS.map((s) => [s, opt(s)]));
    const address = {
      addressLine1: opt("addressLine1"), addressLine2: opt("addressLine2"), city: opt("city"),
      state: opt("state"), postalCode: opt("postalCode"), country: opt("country"),
    };
    const base = { email: v("email").trim(), password: v("password"), website: opt("website"), socialLinks, ...address };
    const payload =
      type === "MERCHANT"
        ? {
            type, ...base,
            businessName: v("businessName").trim(), contactName: v("contactName").trim(),
            contactPhone: opt("contactPhone"), categoryId: opt("categoryId"), description: opt("description"),
          }
        : {
            type, ...base,
            name: v("name").trim(), firstName: v("firstName").trim(), lastName: v("lastName").trim(),
            phone: opt("phone"), industry: opt("industry"), taxId: opt("taxId"),
            employeeCount: v("employeeCount") ? Number(v("employeeCount")) : null,
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
          for (const [k, msgs] of Object.entries(details)) if (msgs?.[0]) mapped[k === "phone" && type === "MERCHANT" ? "contactPhone" : k] = msgs[0];
          setErrors((prev) => ({ ...prev, ...mapped }));
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

  if (!type) {
    const card = (t: SignupType, icon: ReactNode, title: string, desc: string) => (
      <button
        type="button"
        onClick={() => { setType(t); setErrors({}); setFormError(null); }}
        className="flex w-full items-start gap-3 rounded-lg border border-gray-200 p-4 text-left transition hover:border-blue-500 hover:bg-blue-50"
      >
        <span className="mt-0.5 text-blue-600">{icon}</span>
        <span>
          <span className="block font-medium">{title}</span>
          <span className="block text-sm text-gray-600">{desc}</span>
        </span>
      </button>
    );
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Create an account</h2>
        <p className="text-sm text-gray-600">What would you like to sign up as?</p>
        {card("MERCHANT", <Store className="h-5 w-5" />, "Merchant", "List your business and publish offers.")}
        {card("COMPANY", <Building2 className="h-5 w-5" />, "Company", "Give your employees access to offers.")}
        {backLink}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sign up as {type === "MERCHANT" ? "Merchant" : "Company"}</h2>
        <button type="button" className="text-sm text-blue-600 hover:underline" disabled={submitting} onClick={() => setType(null)}>
          Change
        </button>
      </div>
      {formError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>}

      <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
        {type === "MERCHANT" ? (
          <>
            {text("businessName", "Business name", { required: true })}
            {text("contactName", "Contact name", { required: true })}
            {text("contactPhone", "Contact phone", { type: "tel" })}
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
        ) : (
          <>
            {text("name", "Company name", { required: true })}
            <div className="grid grid-cols-2 gap-3">
              {text("firstName", "First name", { required: true })}
              {text("lastName", "Last name", { required: true })}
            </div>
            {text("phone", "Phone", { type: "tel" })}
            {text("employeeCount", "Number of employees", { type: "number" })}
            {text("industry", "Industry")}
            {text("taxId", "Tax ID")}
          </>
        )}

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
