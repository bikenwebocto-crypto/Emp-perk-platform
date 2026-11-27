'use client'
import { StatusBadge } from '@/components/shared/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

interface AuditLog {
  id: string
  action: string
  entityType: string
  entityId: string
  actorName: string
  ipAddress: string | null
  createdAt: string
}

interface AuditLogTableProps {
  logs: AuditLog[]
  isLoading?: boolean
}

export function AuditLogTable({ logs, isLoading }: AuditLogTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }
  if (logs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No audit logs found</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-3 font-medium">Action</th>
            <th className="pb-3 font-medium">Entity</th>
            <th className="pb-3 font-medium">Actor</th>
            <th className="pb-3 font-medium">IP Address</th>
            <th className="pb-3 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
              <td className="py-3">
                <Badge variant="outline">{l.action}</Badge>
              </td>
              <td className="py-3">
                <span className="font-medium">{l.entityType}</span>
                <span className="ml-1 font-mono text-xs text-muted-foreground">#{l.entityId.slice(0, 8)}</span>
              </td>
              <td className="py-3">{l.actorName}</td>
              <td className="py-3 font-mono text-xs text-muted-foreground">{l.ipAddress ?? "—"}</td>
              <td className="py-3 text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
