# MFA recovery

Admin-managed recovery for accounts that lost their authenticator app.
EMPLOYEE accounts have no MFA and cannot use it.

| Account role | Workflow | Who approves |
|---|---|---|
| MERCHANT, COMPANY_ADMIN | `STANDARD` | An active admin with `AdminUser.role = SUPER_ADMIN` |
| SUPER_ADMIN (every admin account) | `SUPER_ADMIN_EMERGENCY` | That admin's designated recovery approver only |

Code: `services/mfa-recovery.service.ts` (all rules), `lib/mfa-recovery/*`
(constants, OTP hashing, Supabase factor calls, emails, route helpers).
Admin UI: `/admin/mfa-recovery` (SUPER_ADMIN only). User UI: `/mfa/recovery`.

## Status lifecycle

```
STANDARD:   PENDING → UNDER_REVIEW → OTP_SENT → OTP_VERIFIED → APPROVED → MFA_RESET → AWAITING_NEW_MFA → COMPLETED
EMERGENCY:  PENDING → OTP_SENT (on creation) → OTP_VERIFIED → APPROVED → …same tail
Any step before APPROVED → REJECTED | EXPIRED (7 days)
```

- `APPROVED` needs `OTP_VERIFIED` first, in both workflows. Email OTP alone never resets anything.
- Every transition is a compare-and-set `updateMany` on the expected status, so concurrent calls cannot both win.
- `activeKey` (unique) holds the account id while a request is open → one open request per account.
- If Supabase factor removal fails, the request stays `APPROVED` with `resetError`; calling approve again retries. Removal is idempotent (an already-missing factor counts as removed).
- `COMPLETED` is set only when `/api/mfa/recovery/complete` finds a newly verified TOTP factor in Supabase.

## OTP rules

6 digits, stored as `HMAC-SHA256(MFA_RECOVERY_OTP_SECRET, requestId:code)`, 10-minute expiry,
5 attempts per code, 10 verify calls per account per 15 min, 60 s resend cooldown, 5 codes per request.
Codes are emailed only to the email captured at request time, and only if the account email has not
changed since. Admins and approvers never see or enter codes; they are never logged.

## Recovery approvers

- Each admin sets their own approver at `PUT /api/admin/security/recovery-approver`. This needs a
  TOTP verification in the same session within the last 5 minutes (read from the JWT AMR claim).
- The approver must be a different, active `SUPER_ADMIN`/`ADMIN` with a verified authenticator and no
  open recovery request of their own. The DB enforces one active approver per admin and no self-assignment.
- An emergency request stores the approver at creation time. Changing the approver later does **not**
  move open requests to the new approver.

## When the approver is unavailable (company emergency procedure)

The system has **no automatic bypass**. If the designated approver is inactive, unreachable, or has
lost their own MFA, the app refuses new emergency requests (`APPROVER_UNAVAILABLE`), and an open
request simply waits. Recover access outside the app:

1. The locked-out admin contacts **two** other people with authority to act: e.g. the CTO and one
   other company director. Neither may be the locked-out admin.
2. Both verify the person independently through channels on file before the incident (video call
   with ID, call-back to the HR-registered phone). Email alone is not enough.
3. One of them, with Supabase project owner access, removes only the old TOTP factor:
   Supabase Dashboard → Authentication → Users → user → MFA factors → delete the `totp` factor.
   Do not delete the user, change its email, or touch the `accounts` row.
4. Record the action: who requested, who verified, who removed which factor id, and when, in the
   security incident log (and reject or let expire any open in-app request with a note).
5. The admin signs in, enrolls a new authenticator, then immediately sets a new available recovery
   approver.

If the Supabase project owner is the locked-out admin, use the Supabase organization's other owner
or Supabase support with organization ownership proof.

## Environment

| Variable | Purpose |
|---|---|
| `MFA_RECOVERY_OTP_SECRET` | **Required.** At least 32 random characters; OTP hash key. Rotating it invalidates outstanding codes only. |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | Existing; used server-side for `auth.admin.mfa.listFactors/deleteFactor`. |
| `SMTP_*`, `NEXT_PUBLIC_APP_URL` | Existing email setup and links in emails. |
