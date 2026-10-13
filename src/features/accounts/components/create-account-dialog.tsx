'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingButton } from '@/components/ui/loading-button'
import { showToast } from '@/hooks/use-toast'
import { useCreateAccount } from '@/hooks/queries/use-accounts'
import { useCurrentUser } from '@/hooks/queries/use-current-user'
import { ADMIN_ROLE_LABELS, assignableRoles, type AdminRoleValue } from '@/lib/access/account-access'


interface CreateAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Creates a system admin. The API invites the Supabase user first, so the
 * email is the login; the chosen role is stored on the AdminUser row.
 */
export function CreateAccountDialog({ open, onOpenChange }: CreateAccountDialogProps) {
  const { data: me } = useCurrentUser()
  const create = useCreateAccount()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AdminRoleValue | ''>('')

  const roles = assignableRoles({ adminRole: me?.adminRole })
  const busy = create.isPending
  const complete = !!firstName.trim() && !!lastName.trim() && !!email.trim() && !!role

  const reset = () => {
    setFirstName('')
    setLastName('')
    setEmail('')
    setRole('')
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && busy) return
    if (!next) reset()
    onOpenChange(next)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!complete || !role) return
    create.mutate(
      { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), role },
      {
        onSuccess: (res) => {
          showToast({ type: 'success', title: 'Invite sent', description: res.message })
          reset()
          onOpenChange(false)
        },
        onError: (err: Error) =>
          showToast({ type: 'error', title: 'Could not create admin', description: err.message }),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create admin account</DialogTitle>
          <DialogDescription>
            We email the new admin a link to set their password. Admins sign in on the web only.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="admin-first-name" className="text-sm font-medium">First name</label>
              <Input
                id="admin-first-name"
                value={firstName}
                maxLength={100}
                disabled={busy}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="admin-last-name" className="text-sm font-medium">Last name</label>
              <Input
                id="admin-last-name"
                value={lastName}
                maxLength={100}
                disabled={busy}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="admin-email" className="text-sm font-medium">Email</label>
            <Input
              id="admin-email"
              type="email"
              value={email}
              maxLength={255}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="admin-role" className="text-sm font-medium">Role</label>
            <select
              id="admin-role"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={role}
              disabled={busy || roles.length === 0}
              onChange={(e) => setRole(e.target.value as AdminRoleValue)}
            >
              <option value="" disabled>Select a role</option>
              {roles.map((r) => (
                <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <LoadingButton type="submit" loading={busy} loadingText="Sending..." disabled={!complete}>
              Send invite
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
