'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingButton } from '@/components/ui/loading-button'
import { PasswordRules } from '@/components/shared/password-rules'
import { showToast } from '@/hooks/use-toast'
import { getPasswordError } from '@/lib/validation/credentials'

function PasswordField(props: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; disabled?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1.5">
      <label htmlFor={props.id} className="text-sm font-medium">{props.label}</label>
      <div className="relative">
        <Input
          id={props.id}
          type={show ? 'text' : 'password'}
          value={props.value}
          autoComplete={props.autoComplete}
          disabled={props.disabled}
          onChange={(e) => props.onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Popup for the signed-in admin to change their own password. */
export function ChangeOwnPasswordDialog({ open, onOpenChange }: Props) {
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) => {
      const res = await fetch('/api/admin/accounts/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to change password')
      return json
    },
  })

  const strengthError = getPasswordError(pwd.next)
  const different = pwd.next.length > 0 && pwd.next !== pwd.current
  const match = pwd.confirm.length > 0 && pwd.next === pwd.confirm
  const canSubmit = pwd.current.length > 0 && !strengthError && different && match

  const close = (next: boolean) => {
    if (!next && mutation.isPending) return
    if (!next) {
      setPwd({ current: '', next: '', confirm: '' })
      setError(null)
    }
    onOpenChange(next)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!pwd.current) return setError('Enter your current password')
    if (strengthError) return setError(strengthError)
    if (!different) return setError('New password must be different from the current password')
    if (!match) return setError('Passwords do not match')
    mutation.mutate(
      { currentPassword: pwd.current, newPassword: pwd.next },
      {
        onSuccess: () => {
          showToast({ type: 'success', title: 'Password changed' })
          close(false)
        },
        onError: (err: Error) => setError(err.message),
      },
    )
  }

  const busy = mutation.isPending
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset your password</DialogTitle>
          <DialogDescription>Enter your current password, then choose a new one.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <PasswordField id="own-current-password" label="Current password" autoComplete="current-password"
            value={pwd.current} disabled={busy} onChange={(v) => setPwd((p) => ({ ...p, current: v }))} />
          <PasswordField id="own-new-password" label="New password" autoComplete="new-password"
            value={pwd.next} disabled={busy} onChange={(v) => setPwd((p) => ({ ...p, next: v }))} />
          <PasswordRules password={pwd.next} />
          <PasswordField id="own-confirm-password" label="Confirm new password" autoComplete="new-password"
            value={pwd.confirm} disabled={busy} onChange={(v) => setPwd((p) => ({ ...p, confirm: v }))} />
          {pwd.confirm.length > 0 && !match && (
            <p className="text-xs text-destructive">Passwords do not match</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => close(false)}>Cancel</Button>
            <LoadingButton type="submit" loading={busy} loadingText="Updating…" disabled={!canSubmit}>
              Update password
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
