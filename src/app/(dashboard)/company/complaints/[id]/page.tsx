'use client'

import { use, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { showToast } from '@/hooks/use-toast'
import { ArrowLeft, FileText, Loader2, Clock, XCircle, AlertTriangle } from 'lucide-react'
import { PRIORITY_STYLES } from '@/features/complaints/constants'
import { TicketAttachmentsButton } from '@/components/ui/ticket-attachments-button'
import { TicketStatusStepper } from '@/components/ui/ticket-status-stepper'

interface ComplaintAction {
  id: string
  actionType: string
  note: string | null
  createdAt: string
}

interface ComplaintDetail {
  id: string
  complaintType: string
  category: string | null
  status: string
  priority: string
  description: string
  evidenceUrls: string[] | null
  escalationNote: string | null
  resolutionNotes: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  offer: { id: string; title: string }
  merchant: { id: string; businessName: string }
  employee: { id: string; firstName: string; lastName: string }
  actions: ComplaintAction[]
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-800',
  CLARIFICATION_REQ: 'bg-purple-100 text-purple-800',
  ESCALATED: 'bg-orange-100 text-orange-800',
  RESOLVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}

const CATEGORY_LABELS: Record<string, string> = {
  BILLING: 'Billing',
  TECHNICAL: 'Technical',
  ACCOUNT: 'Account',
  OTHER: 'Other',
}

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'Complaint Filed',
  REVIEW_STARTED: 'Review Started',
  CLARIFICATION_REQ: 'Clarification Requested',
  EMPLOYEE_RESPONDED: 'Employee Responded',
  ESCALATED: 'Escalated to Admin',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
  MERCHANT_RESPONDED: 'Merchant Responded',
}

export default function CompanyComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const queryClient = useQueryClient()
  const [priority, setPriority] = useState('')
  const [escalationNote, setEscalationNote] = useState('')
  const [initialized, setInitialized] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['company-complaint', id],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      return json as { success: boolean; data: ComplaintDetail }
    },
  })

  if (data?.data && !initialized) {
    setPriority(data.data.priority)
    setInitialized(true)
  }

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/complaints/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-complaint', id] })
      showToast({ type: 'success', title: 'Updated', description: 'Complaint has been updated.' })
    },
    onError: (e: Error) => showToast({ type: 'error', title: 'Failed', description: e.message }),
  })

  const escalateMutation = useMutation({
    mutationFn: async (body: { reason: string }) => {
      const res = await fetch(`/api/complaints/${id}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to escalate')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-complaint', id] })
      setEscalationNote('')
      showToast({ type: 'success', title: 'Escalated', description: 'Complaint has been escalated to super admin.' })
    },
    onError: (e: Error) => showToast({ type: 'error', title: 'Failed', description: e.message }),
  })

  function handlePriorityChange(newPriority: string) {
    setPriority(newPriority)
    updateMutation.mutate({ priority: newPriority })
  }

  function handleEscalate() {
    if (!escalationNote.trim()) {
      showToast({ type: 'error', title: 'Required', description: 'Please provide a reason for escalation.' })
      return
    }
    escalateMutation.mutate({ reason: escalationNote.trim() })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (error || !data?.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <XCircle className="h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">Complaint not found</p>
        <Link href="/company/complaints" className="mt-4">
          <Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
        </Link>
      </div>
    )
  }

  const c = data.data

  return (
    <div className="space-y-6">
      <Link
        href="/company/complaints"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Complaints
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Complaint Details</span>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[c.priority]}`}>{c.priority}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status]}`}>{c.status.replace(/_/g, ' ')}</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TicketStatusStepper status={c.status} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Employee</p>
              <p className="mt-0.5 text-sm font-medium">{c.employee?.firstName} {c.employee?.lastName}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Complaint Type</p>
              <p className="mt-0.5 text-sm capitalize">{c.complaintType.replace(/_/g, ' ').toLowerCase()}</p>
            </div>
            {c.category && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Category</p>
                <p className="mt-0.5 text-sm">{CATEGORY_LABELS[c.category] ?? c.category}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground">Offer</p>
              <p className="mt-0.5 text-sm font-medium">{c.offer?.title ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Merchant</p>
              <p className="mt-0.5 text-sm font-medium">{c.merchant?.businessName ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Submitted</p>
              <p className="mt-0.5 text-sm">{new Date(c.createdAt).toLocaleString()}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Description</p>
            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-sm">{c.description}</p>
          </div>

          <TicketAttachmentsButton urls={c.evidenceUrls} />

          {c.escalationNote && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <p className="text-xs font-medium text-orange-700">Escalation Note</p>
              <p className="mt-1 text-sm text-orange-800">{c.escalationNote}</p>
            </div>
          )}

          {c.resolutionNotes && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-xs font-medium text-green-700">Resolution Notes</p>
              <p className="mt-1 text-sm text-green-800">{c.resolutionNotes}</p>
            </div>
          )}

          {c.resolvedAt && (
            <p className="flex items-center gap-1 text-xs text-green-700">
              <Clock className="h-3 w-3" /> Resolved at {new Date(c.resolvedAt).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Admin Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Priority</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={priority}
              disabled={updateMutation.isPending}
              onChange={(e) => handlePriorityChange(e.target.value)}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Escalation Reason</label>
            <textarea
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={escalationNote}
              onChange={(e) => setEscalationNote(e.target.value)}
              placeholder="Reason for escalating to super admin..."
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleEscalate}
              disabled={escalateMutation.isPending || c.status === 'RESOLVED' || c.status === 'REJECTED'}
            >
              {escalateMutation.isPending ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Escalating…</>
              ) : (
                'Escalate to Admin'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Actions Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(!c.actions || c.actions.length === 0) ? (
            <p className="text-sm text-muted-foreground">No actions recorded yet.</p>
          ) : (
            <div className="relative space-y-0">
              {c.actions.map((action, i) => (
                <div key={action.id} className="flex gap-4 pb-6 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      i === c.actions.length - 1 ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 bg-background text-muted-foreground'
                    }`}>
                      {i + 1}
                    </div>
                    {i < c.actions.length - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-sm font-medium">{ACTION_LABELS[action.actionType] ?? action.actionType.replace(/_/g, ' ')}</p>
                    {action.note && <p className="mt-0.5 text-xs text-muted-foreground">{action.note}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">{new Date(action.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}