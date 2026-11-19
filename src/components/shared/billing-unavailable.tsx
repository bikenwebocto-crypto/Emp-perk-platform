import { Card, CardContent } from '@/components/ui/card'
import { Info } from 'lucide-react'

/** Shown wherever billing used to appear — billing is not part of this model. */
export function BillingUnavailable({ compact = false }: { compact?: boolean }) {
  const message = 'Billing is not available in this model.'
  if (compact) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" /> {message}
      </p>
    )
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
      <Card>
        <CardContent className="flex items-center gap-3 py-8">
          <Info className="h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  )
}
