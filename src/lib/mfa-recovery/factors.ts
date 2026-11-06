import { prisma } from '@/lib/prisma'
import { getAdminClient } from '@/lib/supabase/admin'

// Server-only wrapper around the Supabase Admin MFA API (service-role key).
// auth.admin.mfa.listFactors({ userId }) / deleteFactor({ id, userId }).
// Deleting a verified factor also signs the user out of every session.
//
// Callers pass the internal Account id (accounts.authUserId). That is NOT the
// Supabase Auth user id, so it is resolved here (via the shared email) before
// every Supabase call.

export interface TotpFactor {
  id: string
  status: string
  createdAt: string
}

async function resolveSupabaseUserId(accountId: string): Promise<string> {
  const account = await prisma.account.findUnique({
    where: { authUserId: accountId },
    select: { email: true },
  })
  if (!account) throw new Error(`MFA factor lookup: account ${accountId} not found`)

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM auth.users WHERE lower(email) = lower(${account.email}) LIMIT 1
  `
  const id = rows[0]?.id
  if (!id) throw new Error(`MFA factor lookup: no Supabase Auth user for account ${accountId}`)
  return id
}

export async function listTotpFactors(accountId: string): Promise<TotpFactor[]> {
  const userId = await resolveSupabaseUserId(accountId)
  const { data, error } = await getAdminClient().auth.admin.mfa.listFactors({ userId })
  if (error) throw new Error(`listFactors failed: ${error.message}`)
  return (data?.factors ?? [])
    .filter((f) => f.factor_type === 'totp')
    .map((f) => ({ id: f.id, status: f.status, createdAt: f.created_at }))
}

export async function listVerifiedTotpFactors(accountId: string): Promise<TotpFactor[]> {
  return (await listTotpFactors(accountId)).filter((f) => f.status === 'verified')
}

/**
 * Delete one factor. A factor that is already gone counts as removed, so a
 * retried reset is idempotent.
 */
export async function deleteTotpFactor(accountId: string, factorId: string): Promise<void> {
  const userId = await resolveSupabaseUserId(accountId)
  const { error } = await getAdminClient().auth.admin.mfa.deleteFactor({ id: factorId, userId })
  if (!error) return
  const status = (error as { status?: number }).status
  if (status === 404 || /not found/i.test(error.message)) return
  throw new Error(`deleteFactor failed: ${error.message}`)
}
