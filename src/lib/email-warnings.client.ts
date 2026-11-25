'use client'

import { showToast } from '@/hooks/use-toast'

/**
 * API routes that send notification emails return `emailWarnings: string[]`
 * when an email could not be delivered. The action itself succeeded; this
 * tells the admin/merchant that the recipient did not get the email.
 */
export function showEmailWarnings(json: unknown): void {
  const warnings = (json as { emailWarnings?: unknown } | null)?.emailWarnings
  if (!Array.isArray(warnings)) return
  for (const warning of warnings) {
    if (typeof warning !== 'string' || !warning) continue
    showToast({ type: 'error', title: 'Email not delivered', description: warning })
  }
}
