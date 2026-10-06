'use client'
import { use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/shared/status-badge'
import { useLead } from '@/hooks/queries/use-leads'
import { LeadActions } from '@/features/leads/components/lead-actions'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">{children ?? '—'}</dd>
    </div>
  )
}

function ExtLink({ href }: { href: string | null }) {
  if (!href) return <>—</>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline dark:text-blue-400">
      {href} <ExternalLink className="h-3 w-3" />
    </a>
  )
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : '—')

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: lead, isLoading, error } = useLead(id)

  if (isLoading) return <div className="space-y-4 py-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>
  if (error || !lead) return <p className="py-6 text-sm text-destructive">{(error as Error)?.message ?? 'Lead not found'}</p>

  const isMerchant = lead.type === 'MERCHANT'

  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button type="button" variant="ghost" size="icon" onClick={() => router.push('/admin/leads')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              {lead.companyName} <StatusBadge status={lead.status} />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{isMerchant ? 'Merchant' : 'Employer'} lead · {fmt(lead.createdAt)}</p>
          </div>
        </div>
        <LeadActions lead={lead} />
      </div>

      {lead.status === 'CONVERTED' && (lead.merchant || lead.company) && (
        <Card>
          <CardContent className="pt-6 text-sm">
            Converted to{' '}
            {lead.merchant && <Link className="font-medium text-blue-700 hover:underline dark:text-blue-400" href={`/admin/merchants/${lead.merchant.id}`}>{lead.merchant.businessName}</Link>}
            {lead.company && <Link className="font-medium text-blue-700 hover:underline dark:text-blue-400" href={`/admin/companies/${lead.company.id}`}>{lead.company.name}</Link>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">Contact</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="First name">{lead.firstName}</Field>
              <Field label="Last name">{lead.lastName}</Field>
              <Field label="Email">{lead.email}</Field>
              <Field label="Phone">{lead.phone}</Field>
              <Field label="Company">{lead.companyName}</Field>
              <Field label="Source">{lead.source}</Field>
              <Field label="Heard about us">{lead.hearAbout}</Field>
              <Field label="Last updated">{fmt(lead.updatedAt)}</Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">{isMerchant ? 'Business' : 'Employer'}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              {isMerchant ? (
                <>
                  <Field label="Industry">{lead.industry}</Field>
                  <Field label="Cities">{lead.cities.length ? lead.cities.join(', ') : null}</Field>
                  <Field label="Website"><ExtLink href={lead.websiteUrl} /></Field>
                  <Field label="Social"><ExtLink href={lead.socialUrl} /></Field>
                </>
              ) : (
                <>
                  <Field label="Company size">{lead.companySize}</Field>
                  <Field label="HQ country">{lead.hqCountry}</Field>
                  <Field label="Role">{lead.role}</Field>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-lg">Message & consent</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Message">{lead.message}</Field></div>
              <Field label="Consent given at">{fmt(lead.consentAt)}</Field>
              <Field label="Consent version">{lead.consentVersion}</Field>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
