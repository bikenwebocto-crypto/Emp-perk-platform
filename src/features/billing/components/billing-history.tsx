'use client'
import { StatusBadge } from '@/components/shared/status-badge'
import { Skeleton } from '@/components/ui/skeleton'

interface Invoice {
  id: string
  amount: number
  status: 'paid' | 'pending' | 'failed'
  period: string
  paidAt: string | null
}

interface BillingHistoryProps {
  invoices: Invoice[]
  isLoading?: boolean
}

export function BillingHistory({ invoices, isLoading }: BillingHistoryProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }
  if (invoices.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No invoices found</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-3 font-medium">Invoice</th>
            <th className="pb-3 font-medium">Amount</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium">Period</th>
            <th className="pb-3 font-medium">Paid At</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
              <td className="py-3 font-mono text-xs">{inv.id.slice(0, 8)}</td>
              <td className="py-3 font-medium">€{inv.amount.toFixed(2)}</td>
              <td className="py-3"><StatusBadge status={inv.status} /></td>
              <td className="py-3 text-muted-foreground">{inv.period}</td>
              <td className="py-3 text-muted-foreground">
                {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
