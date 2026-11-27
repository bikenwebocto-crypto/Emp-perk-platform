'use client'
import Link from 'next/link'
import { AlertTriangle, Info } from 'lucide-react'
import type { Lead } from '@/hooks/queries/use-leads'

/**
 * Shown on the add merchant / add company forms when converting a lead:
 * which lead is being converted, the lead details that have no form field,
 * and why the form could not be pre-filled.
 */
export function LeadConvertBanner({
  leadId,
  lead,
  isLoading,
  error,
  expectedType,
}: {
  leadId: string
  lead: Lead | undefined
  isLoading: boolean
  error: Error | null
  expectedType: Lead['type']
}) {
  if (isLoading) {
    return (
      <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Loading lead details…
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Could not load the lead to pre-fill this form{error ? `: ${error.message}` : ''}. Saving will still try to convert it.</span>
      </div>
    )
  }

  const problem =
    lead.status === 'CONVERTED' ? 'This lead has already been converted.'
    : lead.status === 'REJECTED' ? 'This lead was rejected and cannot be converted.'
    : lead.type !== expectedType ? `This is a ${lead.type.toLowerCase()} lead; it cannot be converted here.`
    : null

  const extras: [string, string | null][] = [
    ['Role', lead.role],
    ['Category (from form)', lead.industry],
    ['Company size', lead.companySize],
    ['Redemption', lead.redemption],
    ['LinkedIn', lead.linkedin],
    ['Message', lead.message],
  ]
  const shown = extras.filter(([, v]) => v && v.trim())

  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${problem ? 'border-destructive/40 bg-destructive/5' : 'border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30'}`}>
      <div className="flex items-start gap-2">
        {problem ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
        <div className="space-y-1">
          <p>
            Converting lead{' '}
            <Link href={`/admin/leads/${leadId}`} className="font-medium underline">
              {lead.firstName} {lead.lastName}{lead.companyName ? ` (${lead.companyName})` : ''}
            </Link>
            . Fields were pre-filled from the lead; review and complete the rest.
          </p>
          {problem && <p className="font-medium text-destructive">{problem}</p>}
          {shown.length > 0 && (
            <dl className="grid gap-x-4 gap-y-0.5 pt-1 text-xs text-muted-foreground sm:grid-cols-[max-content_1fr]">
              {shown.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-medium">{k}</dt>
                  <dd className="whitespace-pre-wrap break-words">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  )
}
