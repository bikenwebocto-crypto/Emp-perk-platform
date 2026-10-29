'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/shared/stat-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert } from '@/components/ui/alert'
import { useCompanyDashboard } from '@/hooks/queries/use-company-dashboard'
import { useCompanyEmployees } from '@/hooks/queries/use-company-employees'
import { Users, ShoppingBag, TrendingUp, CreditCard, ArrowRight, AlertCircle, Info, AlertTriangle, Ban } from 'lucide-react'

type DeactivationRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
type CompanyDeactivationRequest = {
  id: string
  status: DeactivationRequestStatus
  reason: string | null
  createdAt: string
  reviewedAt: string | null
  reviewNote: string | null
  employee: {
    id: string
    firstName: string
    lastName: string
    status: string
    accountId: string | null
    account: {
      email: string | null
    } | null
  }
}

async function fetchDeactivationRequests(status: DeactivationRequestStatus | 'ALL' = 'PENDING') {
  const url = status === 'ALL' ? '/api/company/deactivation-requests' : `/api/company/deactivation-requests?status=${encodeURIComponent(status)}`
  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok || !body.success) {
    throw new Error(body.error?.message ?? 'Failed to load deactivation requests')
  }
  return body.data as CompanyDeactivationRequest[]
}

const alertIcons: Record<string, React.ElementType> = {
  NO_EMPLOYEES: Info,
  RENEWAL_DUE: AlertTriangle,
  INVOICE_OVERDUE: AlertCircle,
  ACCOUNT_ON_HOLD: AlertCircle,
  LOW_ENGAGEMENT: AlertTriangle,
}

export default function CompanyDashboard() {
  const router = useRouter()
  const [requestFilter, setRequestFilter] = useState<DeactivationRequestStatus | 'ALL'>('PENDING')
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null)
  const [requestFeedback, setRequestFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>({})

  const { data: dashboard, isLoading: dashLoading, error: dashError, isError: dashIsError } = useCompanyDashboard()
  const { data: employees, error: empError } = useCompanyEmployees({ page: 1, pageSize: 5, sortBy: 'createdAt', sortOrder: 'desc' })
  const { data: deactivationRequests = [], isLoading: requestsLoading, error: requestsError, refetch: refetchRequests } = useQuery({
    queryKey: ['company-deactivation-requests', requestFilter],
    queryFn: () => fetchDeactivationRequests(requestFilter),
  })

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

      {requestFeedback && (
        <Alert
          title={requestFeedback.type === 'success' ? 'Update complete' : 'Could not update request'}
          description={requestFeedback.message}
          variant={requestFeedback.type === 'success' ? 'success' : 'error'}
          icon={requestFeedback.type === 'success' ? Info : AlertCircle}
        />
      )}

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-lg">Account Deactivation Requests</CardTitle>
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
              <Button
                key={status}
                type="button"
                variant={requestFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRequestFilter(status)}
              >
                {status === 'ALL' ? 'All' : status}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {requestsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : requestsError ? (
            <p className="text-sm text-destructive">{requestsError.message}</p>
          ) : deactivationRequests.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No deactivation requests found for this filter.
            </p>
          ) : (
            <div className="space-y-3">
              {deactivationRequests.map((request) => (
                <div key={request.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{request.employee.firstName} {request.employee.lastName}</span>
                        <Badge variant={request.status === 'PENDING' ? 'pending' : request.status === 'APPROVED' ? 'success' : 'secondary'}>
                          {request.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{request.employee.account?.email ?? 'No email on file'}</p>
                      <p className="text-sm text-muted-foreground">Submitted: {new Date(request.createdAt).toLocaleString()}</p>
                      {request.reason && <p className="text-sm">Reason: {request.reason}</p>}
                      {request.reviewNote && <p className="text-sm">Review note: {request.reviewNote}</p>}
                    </div>

                    {request.status === 'PENDING' && (
                      <div className="flex flex-col gap-2 md:items-end">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={async () => {
                              const confirmed = window.confirm('Accept this account deactivation request? This will make the employee inactive and revoke active sessions.')
                              if (!confirmed) return
                              setProcessingRequestId(request.id)
                              try {
                                const res = await fetch(`/api/company/deactivation-requests/${request.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'APPROVE' }),
                                })
                                const body = await res.json()
                                if (!res.ok || !body.success) {
                                  throw new Error(body.error?.message ?? 'Failed to approve request')
                                }
                                setRequestFeedback({ type: 'success', message: 'Deactivation request approved successfully.' })
                                await refetchRequests()
                              } catch (error) {
                                const message = error instanceof Error ? error.message : 'Failed to approve request'
                                setRequestFeedback({ type: 'error', message })
                              } finally {
                                setProcessingRequestId(null)
                              }
                            }}
                            disabled={processingRequestId === request.id}
                          >
                            {processingRequestId === request.id ? 'Processing...' : 'Accept'}
                          </Button>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={rejectionNotes[request.id] ?? ''}
                              onChange={(event) => setRejectionNotes((prev) => ({ ...prev, [request.id]: event.target.value }))}
                              placeholder="Optional rejection note"
                              className="h-9 rounded-md border bg-background px-2 text-sm outline-none ring-0 focus:border-primary"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                const confirmed = window.confirm('Reject this account deactivation request?')
                                if (!confirmed) return
                                setProcessingRequestId(request.id)
                                try {
                                  const res = await fetch(`/api/company/deactivation-requests/${request.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      action: 'REJECT',
                                      reviewNote: rejectionNotes[request.id]?.trim() || undefined,
                                    }),
                                  })
                                  const body = await res.json()
                                  if (!res.ok || !body.success) {
                                    throw new Error(body.error?.message ?? 'Failed to reject request')
                                  }
                                  setRequestFeedback({ type: 'success', message: 'Deactivation request rejected successfully.' })
                                  setRejectionNotes((prev) => ({ ...prev, [request.id]: '' }))
                                  await refetchRequests()
                                } catch (error) {
                                  const message = error instanceof Error ? error.message : 'Failed to reject request'
                                  setRequestFeedback({ type: 'error', message })
                                } finally {
                                  setProcessingRequestId(null)
                                }
                              }}
                              disabled={processingRequestId === request.id}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
