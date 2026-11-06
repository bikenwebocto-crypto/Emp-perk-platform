import { prisma } from '@/lib/prisma'
import type { AccountRole, AccountStatus, AdminRole } from '@prisma/client'

// Account → profile lookups used by the recovery service. Kept separate so the
// service tests can stub them without modelling every profile table.

export interface RecoveryAccount {
  accountId: string
  email: string
  role: AccountRole
  status: AccountStatus
  displayName: string
  phone: string | null
  /** AdminUser fields; null for non-admin accounts. */
  adminRole: AdminRole | null
  adminActive: boolean | null
}

export async function loadRecoveryAccount(accountId: string): Promise<RecoveryAccount | null> {
  const account = await prisma.account.findUnique({ where: { authUserId: accountId } })
  if (!account) return null

  const base = {
    accountId: account.authUserId,
    email: account.email,
    role: account.role,
    status: account.status,
    displayName: account.email,
    phone: null as string | null,
    adminRole: null as AdminRole | null,
    adminActive: null as boolean | null,
  }

  switch (account.role) {
    case 'MERCHANT': {
      const m = await prisma.merchant.findFirst({
        where: { accountId },
        select: { businessName: true, contactPhone: true },
      })
      return { ...base, displayName: m?.businessName ?? base.displayName, phone: m?.contactPhone ?? null }
    }
    case 'COMPANY_ADMIN': {
      const ca = await prisma.companyAdmin.findFirst({
        where: { accountId },
        select: { firstName: true, lastName: true, company: { select: { name: true, phone: true } } },
      })
      if (!ca) return base
      return {
        ...base,
        displayName: `${ca.firstName} ${ca.lastName} (${ca.company.name})`.trim(),
        phone: ca.company.phone ?? null,
      }
    }
    case 'SUPER_ADMIN': {
      const a = await prisma.adminUser.findFirst({
        where: { accountId },
        select: { firstName: true, lastName: true, role: true, isActive: true },
      })
      if (!a) return base
      return {
        ...base,
        displayName: `${a.firstName} ${a.lastName}`.trim(),
        adminRole: a.role,
        adminActive: a.isActive,
      }
    }
    default:
      return base
  }
}

export async function findAccountIdByEmail(email: string): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { authUserId: true },
  })
  return account?.authUserId ?? null
}

/**
 * Admins that could be picked as a recovery approver (active SUPER_ADMIN /
 * ADMIN, not the caller). MFA is checked when one is actually assigned.
 */
export async function listApproverCandidates(excludeAccountId: string) {
  const admins = await prisma.adminUser.findMany({
    where: {
      role: { in: ['SUPER_ADMIN', 'ADMIN'] },
      isActive: true,
      accountId: { not: null },
      NOT: { accountId: excludeAccountId },
    },
    select: { accountId: true, firstName: true, lastName: true, role: true },
    orderBy: { firstName: 'asc' },
  })
  const accounts = await prisma.account.findMany({
    where: { authUserId: { in: admins.map((a) => a.accountId!) }, status: 'ACTIVE' },
    select: { authUserId: true, email: true },
  })
  const emailById = new Map(accounts.map((a) => [a.authUserId, a.email]))
  return admins
    .filter((a) => emailById.has(a.accountId!))
    .map((a) => ({
      accountId: a.accountId!,
      name: `${a.firstName} ${a.lastName}`.trim(),
      email: emailById.get(a.accountId!)!,
      adminRole: a.role,
    }))
}

/** Active SUPER_ADMIN reviewers' emails, for "new standard request" notices. */
export async function listStandardReviewerEmails(): Promise<string[]> {
  const admins = await prisma.adminUser.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true, accountId: { not: null } },
    select: { accountId: true },
  })
  const ids = admins.map((a) => a.accountId!).filter(Boolean)
  if (ids.length === 0) return []
  const accounts = await prisma.account.findMany({
    where: { authUserId: { in: ids }, status: 'ACTIVE' },
    select: { email: true },
  })
  return accounts.map((a) => a.email)
}
