"use client";
import { Check, X } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/validation/credentials";

/** Live checklist of the password rules; each turns green as it is met. */
export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="space-y-1 text-xs">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.id} className={`flex items-center gap-1.5 ${ok ? "text-green-600" : "text-muted-foreground"}`}>
            {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
