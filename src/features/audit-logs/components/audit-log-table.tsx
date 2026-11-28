'use client'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import type { AuditLogRow } from '@/hooks/queries/use-audit-logs'

type AuditLog = Pick<AuditLogRow, 'id' | 'action' | 'entityType' | 'entityId' | 'actorName' | 'ipAddress' | 'createdAt'> &
  Partial<Pick<AuditLogRow, 'actorType' | 'companyName' | 'outcome'>>

interface AuditLogTableProps {
  logs: AuditLog[]
  isLoading?: boolean
  /** Shown instead of the default empty message (e.g. when filters are active). */
  emptyMessage?: string
  onSelect?: (id: string) => void
}

export function outcomeVariant(outcome: string): 'success' | 'destructive' | 'outline' {
  const o = outcome.toUpperCase()
  if (o === 'SUCCESS') return 'success'
  if (o === 'FAILED' || o === 'FRAUD_DETECTED' || o === 'DENIED') return 'destructive'
  return 'outline'
}

export function AuditLogTable({ logs, isLoading, emptyMessage, onSelect }: AuditLogTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading audit logs">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }
  if (logs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage ?? 'No audit logs found'}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-3 font-medium" title="What was done (e.g. CREATE, UPDATE, DELETE, LOGIN)">Action</th>
            <th className="pb-3 font-medium" title="The record type affected, with the first 8 characters of its ID">Entity</th>
            <th className="pb-3 font-medium" title="Who performed the action, and their role">Performed by</th>
            <th className="pb-3 font-medium" title="Company the action relates to, if any">Company</th>
            <th className="pb-3 font-medium" title="Result of the action, when the event records one">Outcome</th>
            <th className="pb-3 font-medium" title="IP address the request came from">IP Address</th>
            <th className="pb-3 font-medium" title="Local date and time of the action">Date &amp; time</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr
              key={l.id}
              className={`border-b transition-colors last:border-0 hover:bg-muted/50 ${onSelect ? 'cursor-pointer' : ''}`}
              onClick={onSelect ? () => onSelect(l.id) : undefined}
              onKeyDown={
                onSelect
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelect(l.id)
                      }
                    }
                  : undefined
              }
              tabIndex={onSelect ? 0 : undefined}
              aria-label={onSelect ? `View details for ${l.action}` : undefined}
            >
              <td className="py-3">
                <Badge variant="outline">{l.action}</Badge>
              </td>
              <td className="py-3">
                <span className="font-medium">{l.entityType}</span>
                <span className="ml-1 font-mono text-xs text-muted-foreground">#{l.entityId.slice(0, 8)}</span>
              </td>
              <td className="py-3">
                {l.actorName}
                {l.actorType && <span className="ml-1 text-xs text-muted-foreground">({l.actorType})</span>}
              </td>
              <td className="py-3 text-muted-foreground">{l.companyName ?? '—'}</td>
              <td className="py-3">
                {l.outcome ? <Badge variant={outcomeVariant(l.outcome)}>{l.outcome}</Badge> : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="py-3 font-mono text-xs text-muted-foreground">{l.ipAddress ?? '—'}</td>
              <td className="py-3 text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
