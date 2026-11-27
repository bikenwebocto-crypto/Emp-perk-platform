'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CreditCard } from 'lucide-react'

interface BillingPlan {
  name: string
  amount: number
  period: string
  nextBilling: string
}

interface BillingUsage {
  activeEmployees: number
  includedEmployees: number
  additionalCost: number
}

interface BillingOverviewProps {
  plan: BillingPlan
  usage: BillingUsage
}

export function BillingOverview({ plan, usage }: BillingOverviewProps) {
  const usagePercent = Math.min((usage.activeEmployees / usage.includedEmployees) * 100, 100)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{plan.name}</p>
          <p className="text-sm text-muted-foreground">
            €{plan.amount.toFixed(2)} / {plan.period}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Next billing: {new Date(plan.nextBilling).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{usage.activeEmployees} / {usage.includedEmployees} active employees</span>
            <span className="font-medium">{usagePercent.toFixed(0)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          {usage.additionalCost > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Additional cost: €{usage.additionalCost.toFixed(2)}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
