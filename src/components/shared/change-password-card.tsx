'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { showToast } from '@/hooks/use-toast'
import { Check, Circle, Eye, EyeOff, Lock, Pencil } from 'lucide-react'

const DEFAULT_ENDPOINT = '/api/merchant/settings/change-password'

function PasswordInput(props: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={props.id}
        type={show ? 'text' : 'password'}
        value={props.value}
        autoComplete={props.autoComplete}
        onChange={(e) => props.onChange(e.target.value)}
        className="pr-10"
        required
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
  )
}

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-600' : 'text-muted-foreground'}`}>
      {ok ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
      {text}
    </li>
  )
}

interface ChangePasswordCardProps {
  /**
   * Endpoint that accepts `{ currentPassword, newPassword }` via POST.
   * Defaults to the merchant change-password route.
   */
  endpoint?: string
  className?: string
}

/**
 * Password card that stays collapsed behind an "Edit" button until the user
 * chooses to change their password.
 */
export function ChangePasswordCard({ endpoint = DEFAULT_ENDPOINT, className }: ChangePasswordCardProps) {
  const [editing, setEditing] = useState(false)
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [pwdError, setPwdError] = useState<string | null>(null)

  const rules = {
    length: pwd.next.length >= 8,
    different: pwd.next.length > 0 && pwd.next !== pwd.current,
    match: pwd.confirm.length > 0 && pwd.next === pwd.confirm,
  }
  const canSubmit = pwd.current.length > 0 && rules.length && rules.different && rules.match

  const reset = () => {
    setPwd({ current: '', next: '', confirm: '' })
    setPwdError(null)
  }

  const changePwd = useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to change password')
      return json
    },
    onSuccess: () => {
      reset()
      setEditing(false)
      showToast({ type: 'success', title: 'Password changed' })
    },
    onError: (e: Error) => setPwdError(e.message || 'Failed to change password'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPwdError(null)
    if (!canSubmit) return
    changePwd.mutate({ currentPassword: pwd.current, newPassword: pwd.next })
  }

  function handleCancel() {
    reset()
    setEditing(false)
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5" /> Password
          </CardTitle>
          {!editing && (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!editing ? (
          <p className="text-sm text-muted-foreground">
            Your password is set. Click <span className="font-medium text-foreground">Edit</span> to change it.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="current-password" className="mb-1 block text-xs font-medium text-muted-foreground">
                Current password
              </label>
              <PasswordInput
                id="current-password"
                autoComplete="current-password"
                value={pwd.current}
                onChange={(v) => setPwd((p) => ({ ...p, current: v }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="new-password" className="mb-1 block text-xs font-medium text-muted-foreground">
                  New password
                </label>
                <PasswordInput
                  id="new-password"
                  autoComplete="new-password"
                  value={pwd.next}
                  onChange={(v) => setPwd((p) => ({ ...p, next: v }))}
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1 block text-xs font-medium text-muted-foreground">
                  Confirm new password
                </label>
                <PasswordInput
                  id="confirm-password"
                  autoComplete="new-password"
                  value={pwd.confirm}
                  onChange={(v) => setPwd((p) => ({ ...p, confirm: v }))}
                />
              </div>
            </div>

            {pwd.next.length > 0 && (
              <ul className="space-y-1">
                <Rule ok={rules.length} text="At least 8 characters" />
                <Rule ok={rules.different} text="Different from current password" />
                <Rule ok={rules.match} text="Passwords match" />
              </ul>
            )}

            {pwdError && <p className="text-sm text-destructive">{pwdError}</p>}

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="ghost" onClick={handleCancel} disabled={changePwd.isPending}>
                Cancel
              </Button>
              <LoadingButton type="submit" loading={changePwd.isPending} loadingText="Updating…" disabled={!canSubmit}>
                Update password
              </LoadingButton>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
