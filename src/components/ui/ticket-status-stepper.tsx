'use client'

import { Check, FileQuestion, ShieldAlert, XCircle } from 'lucide-react'

interface TicketStatusStepperProps {
  status: string
}

const STEP_ORDER = ['OPEN', 'UNDER_REVIEW', 'RESOLVED']

const STEP_LABELS: Record<string, string> = {
  OPEN: 'Open',
  UNDER_REVIEW: 'Under Review',
  RESOLVED: 'Resolved',
}

const OFF_PATH_STYLES: Record<string, string> = {
  CLARIFICATION_REQ: 'bg-purple-100 text-purple-800',
  REJECTED: 'bg-red-100 text-red-800',
  ESCALATED: 'bg-orange-100 text-orange-800',
}

const OFF_PATH_LABELS: Record<string, string> = {
  CLARIFICATION_REQ: 'Clarification Requested',
  REJECTED: 'Rejected',
  ESCALATED: 'Escalated',
}

export function TicketStatusStepper({ status }: TicketStatusStepperProps) {
  const currentIndex = STEP_ORDER.indexOf(status)

  if (currentIndex === -1) {
    const style = OFF_PATH_STYLES[status] ?? 'bg-muted text-muted-foreground'
    return (
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-xs font-medium text-muted-foreground">Status</p>
        <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${style}`}>
          {status === 'CLARIFICATION_REQ' && <FileQuestion className="h-3.5 w-3.5" />}
          {status === 'REJECTED' && <XCircle className="h-3.5 w-3.5" />}
          {status === 'ESCALATED' && <ShieldAlert className="h-3.5 w-3.5" />}
          {OFF_PATH_LABELS[status] ?? status.replace(/_/g, ' ')}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start justify-between">
        {STEP_ORDER.map((step, i) => {
          const isCompleted = i < currentIndex || status === 'RESOLVED'
          const isActive = i === currentIndex
          return (
            <div key={step} className="flex flex-1 flex-col items-center last:flex-none">
              <div className="flex w-full items-center">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isActive
                        ? 'border-2 border-primary bg-background text-primary'
                        : 'border-2 border-muted-foreground/30 bg-background text-muted-foreground'
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : <span className="text-xs font-semibold">{i + 1}</span>}
                </div>
                {i < STEP_ORDER.length - 1 && (
                  <div className={`mx-1 h-0.5 flex-1 rounded ${isCompleted ? 'bg-primary' : 'bg-border'}`} />
                )}
              </div>
              <p
                className={`mt-1.5 text-xs ${isActive ? 'font-semibold text-foreground' : isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {STEP_LABELS[step]}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}