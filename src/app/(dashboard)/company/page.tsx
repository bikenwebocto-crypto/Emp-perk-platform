'use client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/shared/stat-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert } from '@/components/ui/alert'
import { useCompanyDashboard } from '@/hooks/queries/use-company-dashboard'
import { useCompanyEmployees } from '@/hooks/queries/use-company-employees'
import { Users, ShoppingBag, TrendingUp, CreditCard, ArrowRight, AlertCircle, Info, AlertTriangle, Ban } from 'lucide-react'

const alertIcons: Record<string, React.ElementType> = {
  NO_EMPLOYEES: Info,
  RENEWAL_DUE: AlertTriangle,
  INVOICE_OVERDUE: AlertCircle,
  ACCOUNT_ON_HOLD: AlertCircle,
  LOW_ENGAGEMENT: AlertTriangle,
}

export default function CompanyDashboard() {
  const router = useRouter()
  const { data: dashboard, isLoading: dashLoading, error: dashError, isError: dashIsError } = useCompanyDashboard()
  const { data: employees, error: empError } = useCompanyEmployees({ page: 1, pageSize: 5, sortBy: 'createdAt', sortOrder: 'desc' })

  const isInactive = (dashError as Error & { code?: string })?.code === 'COMPANY_INACTIVE'

  if (dashLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (isInactive) {
    const statusMsg = (dashError as any)?.message ?? 'Your company\'s access is currently inactive.'
    return (
      <div className="space-y-6">
        <Alert
          title="Account Inactive"
          description={statusMsg}
          variant="error"
          icon={Ban}
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Ban className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <h2 className="text-lg font-semibold">Access Restricted</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {statusMsg} Please contact your account manager or support team to restore access.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (dashIsError && !dashboard) {
    return (
      <div className="space-y-6">
        <Alert
          title="Unable to load dashboard"
          description={dashError instanceof Error ? dashError.message : 'An unexpected error occurred'}
          variant="error"
          icon={AlertCircle}
        />
      </div>
    )
  }

  const stats = dashboard ?? {
    enrolledEmployees: 0, activeThisMonth: 0, activationRate: 0, redemptionsThisMonth: 0,
    totalSavings: 0, nextBillingDate: null, estimatedRenewalAmount: 0, plan: 'Trial', billingStatus: 'ACTIVE', alerts: [],
  }

  return (
    <div className="space-y-6">
      {empError && (
        <Alert
          title="Employees Unavailable"
          description="Could not load recent employees. Please try again later."
          variant="warning"
          icon={AlertCircle}
        />
      )}

      {/* Alerts */}
      {stats.alerts.length > 0 && (
        <div className="space-y-2">
          {stats.alerts.map((a, i) => {
            const Icon = alertIcons[a.type] ?? AlertCircle
            const severity = (a.severity?.toLowerCase() as 'info' | 'warning' | 'error') ?? 'info'
            return (
              <Alert
                key={i}
                title={a.type.replace(/_/g, ' ')}
                description={a.message}
                variant={severity}
                icon={Icon}
              />
            )
          })}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Enrolled Employees" value={String(stats.enrolledEmployees)} icon={Users} />
        <StatCard title="Active This Month" value={String(stats.activeThisMonth)} trend={stats.activationRate ? { value: stats.activationRate, isUp: stats.activationRate >= 50 } : undefined} icon={TrendingUp} />
        <StatCard title="This Month Redemptions" value={String(stats.redemptionsThisMonth)} icon={ShoppingBag} />
        <StatCard title="Next Billing" value={`€${stats.estimatedRenewalAmount.toLocaleString()}`} description={stats.nextBillingDate ? new Date(stats.nextBillingDate).toLocaleDateString() : 'N/A'} icon={CreditCard} />
      </div>

      {/* Content */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent employees */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Employees</CardTitle>
            <Button variant="outline" size="sm" onClick={() => router.push('/company/employees')}>
              View All <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent>
            {(!employees?.data || employees.data.length === 0) ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No employees yet. Invite your first employee.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-3 font-medium">Name</th>
                      <th className="pb-3 font-medium">Department</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Redemptions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.data.map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="py-3 font-medium">{e.firstName} {e.lastName}</td>
                        <td className="py-3 text-muted-foreground">{e.department ?? '-'}</td>
                        <td className="py-3"><Badge variant={e.status === 'ACTIVE' ? 'success' : e.status === 'INVITED' ? 'pending' : 'secondary'}>{e.status}</Badge></td>
                        <td className="py-3">{e._count.redemptions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => router.push('/company/employees')}>
              <Users className="h-4 w-4" /> View All Employees
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => router.push('/company/billing')}>
              <CreditCard className="h-4 w-4" /> View Billing
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => router.push('/company/settings')}>
              <TrendingUp className="h-4 w-4" /> Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
