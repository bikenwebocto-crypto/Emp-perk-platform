'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, CheckCircle2, Download, Loader2, Pencil, Trash2, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { CSVUploadDropzone } from '@/features/csv-uploads/components/csv-upload-dropzone'
import { useCompanies } from '@/hooks/queries/use-companies'
import { companyEmployeeKeys } from '@/hooks/queries/use-company-employees'
import {
  employeeKeys,
  useCreateBulkEmployees,
  useValidateBulkEmployees,
  type BulkCreateResponse,
} from '@/hooks/queries/use-employees'
import { showToast } from '@/hooks/use-toast'
import { cn } from '@/utils/cn'
import type { BulkRowError, BulkRowField, BulkRowInput } from '@/lib/employees/bulk-validate'

const PAGE_SIZE = 50
const DEBOUNCE_MS = 400
const MAX_FILE_BYTES = 2 * 1024 * 1024

const COLUMNS: { field: BulkRowField; label: string; className: string }[] = [
  { field: 'name', label: 'Name', className: 'min-w-[150px]' },
  { field: 'email', label: 'Email', className: 'min-w-[210px]' },
  { field: 'department', label: 'Department', className: 'min-w-[120px]' },
  { field: 'jobTitle', label: 'Job title', className: 'min-w-[120px]' },
  { field: 'phone', label: 'Phone', className: 'min-w-[110px]' },
  { field: 'employeeId', label: 'Employee ID', className: 'min-w-[100px]' },
]

const SAMPLE_CSV = [
  ['name', 'email', 'department', 'jobTitle', 'phone', 'employeeId'],
  ['Anna Kowalski', 'anna@example.com', 'HR', 'HR Manager', '+357 99 000000', 'E-001'],
  ['John Smith', 'john@example.com', 'Engineering', 'Developer', '', 'E-002'],
]

type Step = 'upload' | 'review' | 'result'
type Tab = 'all' | 'valid' | 'invalid'
type RowState = 'valid' | 'invalid' | 'checking'

/**
 * A row as the admin has edited it. `rev` bumps on every edit so a
 * validation result can be tied to the exact values it checked: results
 * only ever update `checks`, never the row values, so in-progress edits
 * are never overwritten by a slower server response.
 */
type ReviewRow = BulkRowInput & { rev: number }

interface RowCheck {
  rev: number
  valid: boolean
  errors: BulkRowError[]
}

function toInput(row: BulkRowInput): BulkRowInput {
  return {
    clientId: row.clientId,
    sourceRow: row.sourceRow,
    name: row.name,
    email: row.email,
    department: row.department,
    jobTitle: row.jobTitle,
    phone: row.phone,
    employeeId: row.employeeId,
  }
}

function csvCell(value: unknown, guardFormulas: boolean): string {
  let s = value == null ? '' : String(value)
  if (guardFormulas && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(filename: string, lines: unknown[][], guardFormulas = true) {
  const body = lines.map((line) => line.map((v) => csvCell(v, guardFormulas)).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface BulkEmployeeUploadProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Target company. When omitted the admin picks one in step 1. */
  companyId?: string
}

export function BulkEmployeeUpload({ open, onOpenChange, companyId: fixedCompanyId }: BulkEmployeeUploadProps) {
  const queryClient = useQueryClient()
  const { mutateAsync: validateAsync } = useValidateBulkEmployees()
  const createMutation = useCreateBulkEmployees()
  const { data: companiesData } = useCompanies({ status: 'ACTIVE', pageSize: 100 })
  const companies: { id: string; name: string }[] = companiesData?.data ?? []

  const [step, setStep] = useState<Step>('upload')
  const [pickedCompanyId, setPickedCompanyId] = useState('')
  const companyId = fixedCompanyId || pickedCompanyId

  const [rows, setRows] = useState<ReviewRow[]>([])
  const [checks, setChecks] = useState<Record<string, RowCheck>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [page, setPage] = useState(1)
  const [validating, setValidating] = useState(false)
  const [result, setResult] = useState<BulkCreateResponse | null>(null)
  const [submitted, setSubmitted] = useState<ReviewRow[]>([])
  const [confirmClose, setConfirmClose] = useState(false)

  const rowsRef = useRef(rows)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bumped for every validation request and every edit; a response is
  // applied only if nothing newer has happened since it was sent.
  const seqRef = useRef(0)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const hasUnsavedRows = step === 'review' && rows.length > 0
  useEffect(() => {
    if (!open || !hasUnsavedRows) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [open, hasUnsavedRows])

  // ── Validation ───────────────────────────────────────────────
  const runValidation = useCallback(
    async (snapshot: ReviewRow[]) => {
      const seq = ++seqRef.current
      if (snapshot.length === 0) {
        setChecks({})
        setValidating(false)
        return
      }
      setValidating(true)
      const revAtSend = new Map(snapshot.map((r) => [r.clientId, r.rev]))
      try {
        const res = await validateAsync({ companyId, rows: snapshot.map(toInput) })
        if (seq !== seqRef.current) return // superseded by a newer edit / request

        // Merge by clientId. Each check records the rev it validated, so a
        // row edited after this request was sent shows as "Checking" until
        // the follow-up request lands.
        const next: Record<string, RowCheck> = {}
        for (const r of res.rows) {
          const rev = revAtSend.get(r.clientId)
          if (rev !== undefined) next[r.clientId] = { rev, valid: r.valid, errors: r.errors }
        }
        setChecks(next)
        // Auto-deselect rows that are now invalid.
        setSelected((prev) => {
          const kept = new Set([...prev].filter((id) => next[id]?.valid !== false))
          return kept.size === prev.size ? prev : kept
        })
        setValidating(false)
      } catch (err) {
        if (seq !== seqRef.current) return
        setValidating(false)
        showToast({ type: 'error', title: 'Validation failed', description: (err as Error).message })
      }
    },
    [companyId, validateAsync],
  )

  const scheduleValidation = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    seqRef.current++ // any in-flight response checked older values
    setValidating(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void runValidation(rowsRef.current)
    }, DEBOUNCE_MS)
  }, [runValidation])

  // ── Step 1: upload ───────────────────────────────────────────
  const handleFile = async (file: File) => {
    if (!companyId) {
      showToast({ type: 'error', title: 'Select a company first' })
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      showToast({ type: 'error', title: 'File too large', description: 'CSV files must be under 2 MB.' })
      return
    }
    const seq = ++seqRef.current
    setValidating(true)
    try {
      const csv = await file.text()
      const res = await validateAsync({ companyId, csv })
      if (seq !== seqRef.current) return
      setRows(res.rows.map((r) => ({ ...toInput(r), rev: 0 })))
      setChecks(Object.fromEntries(res.rows.map((r) => [r.clientId, { rev: 0, valid: r.valid, errors: r.errors }])))
      setSelected(new Set(res.rows.filter((r) => r.valid).map((r) => r.clientId)))
      setEditingId(null)
      setTab('all')
      setPage(1)
      setStep('review')
    } catch (err) {
      if (seq === seqRef.current) {
        showToast({ type: 'error', title: 'Could not read CSV', description: (err as Error).message })
      }
    } finally {
      if (seq === seqRef.current) setValidating(false)
    }
  }

  // ── Step 2: review / edit ────────────────────────────────────
  const editCell = (clientId: string, field: BulkRowField, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.clientId === clientId ? { ...r, [field]: value, rev: r.rev + 1 } : r)),
    )
    scheduleValidation()
  }

  const deleteRow = (clientId: string) => {
    setRows((prev) => prev.filter((r) => r.clientId !== clientId))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(clientId)
      return next
    })
    if (editingId === clientId) setEditingId(null)
    // Removing a row can clear a duplicate-email error on another row.
    scheduleValidation()
  }

  const rowState = useCallback(
    (row: ReviewRow): RowState => {
      const check = checks[row.clientId]
      if (!check || check.rev !== row.rev) return 'checking'
      return check.valid ? 'valid' : 'invalid'
    },
    [checks],
  )

  const counts = useMemo(() => {
    let valid = 0
    let invalid = 0
    for (const row of rows) {
      const s = rowState(row)
      if (s === 'valid') valid++
      else if (s === 'invalid') invalid++
    }
    return { all: rows.length, valid, invalid }
  }, [rows, rowState])

  const visibleRows = useMemo(
    () => (tab === 'all' ? rows : rows.filter((r) => rowState(r) === tab)),
    [rows, tab, rowState],
  )
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = visibleRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const selectableIds = useMemo(
    () => rows.filter((r) => rowState(r) === 'valid').map((r) => r.clientId),
    [rows, rowState],
  )
  const selectedRows = rows.filter((r) => selected.has(r.clientId))
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))
  const someSelected = !allSelected && selectableIds.some((id) => selected.has(id))

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds))
  const toggleRow = (clientId: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(clientId)
      else next.delete(clientId)
      return next
    })

  const handleUpload = async () => {
    if (selectedRows.length === 0 || validating) return
    try {
      const res = await createMutation.mutateAsync({ companyId, rows: selectedRows.map(toInput) })
      setSubmitted(selectedRows)
      setResult(res)
      setEditingId(null)
      setStep('result')
    } catch (err) {
      showToast({ type: 'error', title: 'Upload failed', description: (err as Error).message })
    }
  }

  // ── Step 3: result ───────────────────────────────────────────
  const submittedById = useMemo(() => new Map(submitted.map((r) => [r.clientId, r])), [submitted])

  const downloadResult = () => {
    if (!result) return
    downloadCsv('employee-upload-result.csv', [
      ['Row', 'Name', 'Email', 'Status', 'Reason'],
      ...result.results.map((r) => [
        r.sourceRow ?? '',
        submittedById.get(r.clientId)?.name ?? '',
        r.email,
        r.status,
        r.status === 'FAILED' ? r.reason ?? '' : r.emailSent === false ? 'Invite email not sent' : '',
      ]),
    ])
  }

  const fixFailedRows = () => {
    if (!result) return
    const failedIds = new Set(result.results.filter((r) => r.status === 'FAILED').map((r) => r.clientId))
    const failedRows = submitted
      .filter((r) => failedIds.has(r.clientId))
      .map((r) => ({ ...r, rev: r.rev + 1 }))
    setRows(failedRows)
    setChecks({})
    setSelected(new Set())
    setResult(null)
    setSubmitted([])
    setTab('all')
    setPage(1)
    setStep('review')
    void runValidation(failedRows)
  }

  // ── Open / close ─────────────────────────────────────────────
  const reset = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    seqRef.current++
    setStep('upload')
    setPickedCompanyId('')
    setRows([])
    setChecks({})
    setSelected(new Set())
    setEditingId(null)
    setTab('all')
    setPage(1)
    setValidating(false)
    setResult(null)
    setSubmitted([])
    setConfirmClose(false)
  }

  const finish = () => {
    queryClient.invalidateQueries({ queryKey: employeeKeys.lists() })
    queryClient.invalidateQueries({ queryKey: companyEmployeeKeys.all })
    reset()
    onOpenChange(false)
  }

  const requestClose = () => {
    if (createMutation.isPending) return
    if (hasUnsavedRows) {
      setConfirmClose(true)
      return
    }
    if (step === 'result') {
      finish()
      return
    }
    reset()
    onOpenChange(false)
  }

  const companyName = companies.find((c) => c.id === companyId)?.name

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk upload employees</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Step 1 of 3: choose a company and upload a CSV file.'}
            {step === 'review' && 'Step 2 of 3: review and fix rows, then upload the ones you select.'}
            {step === 'result' && 'Step 3 of 3: upload results.'}
            {companyName && step !== 'upload' && <> Company: <span className="font-medium text-foreground">{companyName}</span></>}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            {!fixedCompanyId && (
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Company <span className="text-destructive">*</span>
                </label>
                <select
                  value={pickedCompanyId}
                  onChange={(e) => setPickedCompanyId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <CSVUploadDropzone onUpload={handleFile} isUploading={validating} acceptedFormats=".csv" />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>
                Columns: <span className="font-medium">name, email</span> (required); department, jobTitle, phone,
                employeeId (optional). Up to 500 rows.
              </p>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => downloadCsv('employees-sample.csv', SAMPLE_CSV, false)}
              >
                <Download className="mr-1 h-3.5 w-3.5" />Download sample CSV
              </Button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-sm" role="tablist">
                {(['all', 'valid', 'invalid'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => {
                      setTab(t)
                      setPage(1)
                    }}
                    className={cn(
                      'rounded px-3 py-1 capitalize transition-colors',
                      tab === t ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t} ({counts[t]})
                  </button>
                ))}
              </div>
              {validating && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Validating…
                </span>
              )}
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="w-10 px-2 py-2">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        disabled={selectableIds.length === 0}
                        onCheckedChange={toggleAll}
                        aria-label="Select all valid rows"
                      />
                    </th>
                    <th className="w-14 px-2 py-2">Row</th>
                    {COLUMNS.map((c) => (
                      <th key={c.field} className={cn('px-2 py-2', c.className)}>{c.label}</th>
                    ))}
                    <th className="min-w-[130px] px-2 py-2">Status</th>
                    <th className="w-20 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNS.length + 4} className="px-2 py-8 text-center text-muted-foreground">
                        No rows in this view
                      </td>
                    </tr>
                  )}
                  {pageRows.map((row) => {
                    const state = rowState(row)
                    const errors = checks[row.clientId]?.errors ?? []
                    const fieldError = (field: BulkRowField | 'row') =>
                      errors.filter((e) => e.field === field).map((e) => e.message).join('; ')
                    const editing = editingId === row.clientId
                    return (
                      <tr
                        key={row.clientId}
                        className={cn('border-t align-top', state === 'invalid' && 'bg-red-50 dark:bg-red-950/20')}
                      >
                        <td className="px-2 py-2">
                          <Checkbox
                            checked={selected.has(row.clientId)}
                            disabled={state !== 'valid'}
                            onCheckedChange={(c) => toggleRow(row.clientId, c === true)}
                            aria-label={`Select row ${row.sourceRow ?? ''}`}
                          />
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{row.sourceRow ?? '—'}</td>
                        {COLUMNS.map((c) => {
                          const error = fieldError(c.field)
                          const value = row[c.field] ?? ''
                          return (
                            <td key={c.field} className="px-2 py-1.5">
                              {editing ? (
                                <Input
                                  value={value}
                                  onChange={(e) => editCell(row.clientId, c.field, e.target.value)}
                                  aria-invalid={!!error}
                                  aria-label={c.label}
                                  className={cn('h-8', error && 'border-destructive focus-visible:ring-destructive')}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setEditingId(row.clientId)}
                                  title="Click to edit"
                                  className={cn(
                                    'block min-h-8 w-full break-all rounded-md border px-2 py-1 text-left',
                                    error ? 'border-destructive' : 'border-transparent hover:border-input',
                                  )}
                                >
                                  {value || <span className="text-muted-foreground">—</span>}
                                </button>
                              )}
                              {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
                            </td>
                          )
                        })}
                        <td className="px-2 py-2">
                          {state === 'checking' && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />Checking
                            </span>
                          )}
                          {state === 'valid' && <Badge variant="live">Valid</Badge>}
                          {state === 'invalid' && (
                            <Badge variant="suspended">
                              {errors.length === 1 ? errors[0]!.message : `${errors.length} errors`}
                            </Badge>
                          )}
                          {fieldError('row') && <p className="mt-1 text-xs text-destructive">{fieldError('row')}</p>}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setEditingId(editing ? null : row.clientId)}
                              aria-label={editing ? 'Finish editing' : 'Edit row'}
                              title={editing ? 'Finish editing' : 'Edit row'}
                            >
                              {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => deleteRow(row.clientId)}
                              aria-label="Remove row"
                              title="Remove row"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-end gap-2 text-sm">
                <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                  Previous
                </Button>
                <span className="text-muted-foreground">Page {currentPage} of {pageCount}</span>
                <Button size="sm" variant="outline" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                  Next
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <p className="text-sm text-muted-foreground">
                {selectedRows.length} of {counts.valid} valid row(s) selected
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={requestClose} disabled={createMutation.isPending}>
                  Cancel
                </Button>
                <LoadingButton
                  onClick={handleUpload}
                  disabled={selectedRows.length === 0 || validating}
                  loading={createMutation.isPending}
                  loadingText="Uploading..."
                >
                  Upload {selectedRows.length} selected
                </LoadingButton>
              </div>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="live">{result.summary.created} added</Badge>
              <Badge variant="suspended">{result.summary.failed} failed</Badge>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="w-14 px-2 py-2">Row</th>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r) => {
                    const failed = r.status === 'FAILED'
                    return (
                      <tr key={r.clientId} className={cn('border-t', failed && 'bg-red-50 dark:bg-red-950/20')}>
                        <td className="px-2 py-2 text-muted-foreground">{r.sourceRow ?? '—'}</td>
                        <td className="px-2 py-2">{submittedById.get(r.clientId)?.name ?? ''}</td>
                        <td className="px-2 py-2">{r.email}</td>
                        <td className="px-2 py-2">
                          {failed ? (
                            <span className="inline-flex items-center gap-1 text-destructive">
                              <XCircle className="h-4 w-4" />Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-500">
                              <CheckCircle2 className="h-4 w-4" />Added
                            </span>
                          )}
                        </td>
                        <td className={cn('px-2 py-2', failed ? 'text-destructive' : 'text-muted-foreground')}>
                          {failed ? r.reason : r.emailSent === false ? 'Invite email not sent' : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={downloadResult}>
                <Download className="mr-1 h-4 w-4" />Download result CSV
              </Button>
              <Button variant="outline" onClick={fixFailedRows} disabled={result.summary.failed === 0}>
                Fix failed rows
              </Button>
              <Button onClick={finish}>Done</Button>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={confirmClose}
          title="Discard this upload?"
          message={`${rows.length} row(s) have not been uploaded. Closing will discard them.`}
          confirmLabel="Discard"
          onConfirm={() => {
            reset()
            onOpenChange(false)
          }}
          onCancel={() => setConfirmClose(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
