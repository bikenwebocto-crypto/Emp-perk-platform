'use client'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuditLogDetail, type AuditChangeView } from '@/hooks/queries/use-audit-logs'
import { outcomeVariant } from './audit-log-table'

const NOT_RECORDED = <span className="italic text-muted-foreground">Not recorded</span>

function formatValue(v: unknown) {
  if (v === null) return <span className="text-muted-foreground">null</span>
  if (v === undefined) return NOT_RECORDED
  if (typeof v === 'string') return v === '' ? <span className="text-muted-foreground">(empty)</span> : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return <pre className="whitespace-pre-wrap break-all font-mono text-xs">{JSON.stringify(v, null, 2)}</pre>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 break-all">{children ?? NOT_RECORDED}</dd>
    </div>
  )
}

function ChangesSection({ changes }: { changes: AuditChangeView }) {
  if (changes.kind === 'none') {
    return <p className="text-sm text-muted-foreground">No change details were recorded for this event.</p>
  }
  if (changes.kind === 'raw') {
    return <div className="rounded-md border p-3">{formatValue(changes.value)}</div>
  }
  if (changes.kind === 'snapshot') {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Only the recorded values are available; the previous state was not captured.
        </p>
        <dl className="rounded-md border px-3">
          {Object.entries(changes.values).map(([k, v]) => (
            <Row key={k} label={k}>{formatValue(v)}</Row>
          ))}
        </dl>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Before</th>
            <th className="px-3 py-2 font-medium">After</th>
          </tr>
        </thead>
        <tbody>
          {changes.fields.map((f) => {
            const changed = f.hasBefore && f.hasAfter && JSON.stringify(f.before) !== JSON.stringify(f.after)
            return (
              <tr key={f.field} className="border-b align-top last:border-0">
                <td className="px-3 py-2 font-medium">{f.field}</td>
                <td className={`px-3 py-2 ${changed ? 'bg-destructive/5' : ''}`}>
                  {f.hasBefore ? formatValue(f.before) : NOT_RECORDED}
                </td>
                <td className={`px-3 py-2 ${changed ? 'bg-success/10' : ''}`}>
                  {f.hasAfter ? formatValue(f.after) : NOT_RECORDED}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function AuditLogDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, isError, error } = useAuditLogDetail(id)

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audit entry</DialogTitle>
          <DialogDescription>Recorded event details. Sensitive values are redacted.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load audit entry'}
          </p>
        ) : data ? (
          <div className="space-y-5">
            <section>
              <dl className="divide-y">
                <Row label="Action"><Badge variant="outline">{data.action}</Badge></Row>
                <Row label="Timestamp">{new Date(data.createdAt).toLocaleString()}</Row>
                <Row label="Actor">
                  {data.actorName}
                  <span className="ml-1 text-xs text-muted-foreground">({data.actorType})</span>
                  {data.actorId && <div className="font-mono text-xs text-muted-foreground">{data.actorId}</div>}
                </Row>
                <Row label="Entity">
                  {data.entityType}
                  <div className="font-mono text-xs text-muted-foreground">{data.entityId}</div>
                </Row>
                <Row label="Company">{data.companyName ?? (data.companyId ? <span className="font-mono text-xs">{data.companyId}</span> : null)}</Row>
                <Row label="Outcome">
                  {data.outcome ? <Badge variant={outcomeVariant(data.outcome)}>{data.outcome}</Badge> : null}
                </Row>
                <Row label="Reason">{data.reason}</Row>
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Changes</h3>
              <ChangesSection changes={data.changes} />
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Request</h3>
              <dl className="divide-y">
                <Row label="IP address">{data.request.ipAddress && <span className="font-mono text-xs">{data.request.ipAddress}</span>}</Row>
                <Row label="User agent">{data.request.userAgent && <span className="text-xs">{data.request.userAgent}</span>}</Row>
                <Row label="Request ID">{data.request.requestId && <span className="font-mono text-xs">{data.request.requestId}</span>}</Row>
              </dl>
            </section>

            {data.metadata && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Additional metadata</h3>
                <div className="rounded-md border p-3">{formatValue(data.metadata)}</div>
              </section>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
