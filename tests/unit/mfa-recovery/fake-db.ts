import { randomUUID } from 'crypto'

// Minimal in-memory stand-in for the four MFA recovery Prisma models. It keeps
// the behaviours the service relies on for safety: unique constraints (P2002),
// compare-and-set updateMany counts, and transaction rollback on throw.

type Row = Record<string, any>
type Where = Record<string, any>

function matchValue(actual: any, cond: any): boolean {
  if (cond === null) return actual === null || actual === undefined
  if (cond instanceof Date) return actual instanceof Date && actual.getTime() === cond.getTime()
  if (typeof cond === 'object' && !Array.isArray(cond)) {
    if ('in' in cond && !cond.in.includes(actual)) return false
    if ('notIn' in cond && cond.notIn.includes(actual)) return false
    if ('lt' in cond && !(actual < cond.lt)) return false
    if ('gte' in cond && !(actual >= cond.gte)) return false
    if ('gt' in cond && !(actual > cond.gt)) return false
    if ('not' in cond && (cond.not === null ? actual === null || actual === undefined : actual === cond.not)) return false
    if ('contains' in cond) {
      const a = String(actual ?? '')
      const c = String(cond.contains)
      if (!(cond.mode === 'insensitive' ? a.toLowerCase().includes(c.toLowerCase()) : a.includes(c))) return false
    }
    return true
  }
  return actual === cond
}

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Where[]).some((w) => matches(row, w))
    if (key === 'NOT') return !matches(row, cond)
    return matchValue(row[key], cond)
  })
}

function applyData(row: Row, data: Row): Row {
  const next = { ...row }
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && 'increment' in v) {
      next[k] = (next[k] ?? 0) + v.increment
    } else if (v !== undefined) {
      next[k] = v
    }
  }
  next.updatedAt = new Date()
  return next
}

function sortRows(rows: Row[], orderBy?: Record<string, 'asc' | 'desc'>): Row[] {
  if (!orderBy) return rows
  const [[field, dir]] = Object.entries(orderBy)
  return [...rows].sort((a, b) => {
    const av = a[field] instanceof Date ? a[field].getTime() : a[field]
    const bv = b[field] instanceof Date ? b[field].getTime() : b[field]
    if (av === bv) return 0
    return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1)
  })
}

function uniqueViolation(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
}

const DEFAULTS: Record<string, () => Row> = {
  mfaRecoveryRequest: () => ({
    status: 'PENDING', otpSendCount: 0, resetFactorIds: [], requestedAt: new Date(),
    reviewedByAccountId: null, reviewedAt: null, otpSentAt: null, otpVerifiedAt: null,
    approvedByAccountId: null, approvedAt: null, rejectedByAccountId: null, rejectedAt: null,
    rejectionReason: null, resetAt: null, resetError: null, newFactorId: null, completedAt: null,
    assignedApproverAccountId: null, registeredPhone: null, activeKey: null,
  }),
  mfaRecoveryOtp: () => ({ attempts: 0, maxAttempts: 5, verifiedAt: null, consumedAt: null }),
  mfaRecoveryApprover: () => ({ isActive: true, assignedAt: new Date(), revokedAt: null, revokedByAccountId: null }),
  mfaRecoveryAuditLog: () => ({}),
}

export function createFakeDb() {
  const tables: Record<string, Row[]> = {
    mfaRecoveryRequest: [],
    mfaRecoveryOtp: [],
    mfaRecoveryApprover: [],
    mfaRecoveryAuditLog: [],
  }

  function checkUnique(model: string, rows: Row[]) {
    if (model === 'mfaRecoveryRequest') {
      const keys = rows.map((r) => r.activeKey).filter((k) => k !== null && k !== undefined)
      if (new Set(keys).size !== keys.length) throw uniqueViolation()
    }
    if (model === 'mfaRecoveryApprover') {
      const active = rows.filter((r) => r.isActive).map((r) => r.superAdminAccountId)
      if (new Set(active).size !== active.length) throw uniqueViolation()
    }
  }

  function delegate(model: string) {
    return {
      create: async ({ data }: { data: Row }) => {
        const now = new Date()
        const row = { id: randomUUID(), createdAt: now, updatedAt: now, ...DEFAULTS[model](), ...data }
        const next = [...tables[model], row]
        checkUnique(model, next)
        tables[model] = next
        return { ...row }
      },
      findUnique: async ({ where }: { where: Where }) => {
        const row = tables[model].find((r) => matches(r, where))
        return row ? { ...row } : null
      },
      findFirst: async ({ where, orderBy }: { where?: Where; orderBy?: any } = {}) => {
        const row = sortRows(tables[model].filter((r) => matches(r, where)), orderBy)[0]
        return row ? { ...row } : null
      },
      findMany: async ({ where, orderBy, skip = 0, take }: { where?: Where; orderBy?: any; skip?: number; take?: number } = {}) => {
        const rows = sortRows(tables[model].filter((r) => matches(r, where)), orderBy)
        return rows.slice(skip, take === undefined ? undefined : skip + take).map((r) => ({ ...r }))
      },
      count: async ({ where }: { where?: Where } = {}) => tables[model].filter((r) => matches(r, where)).length,
      update: async ({ where, data }: { where: Where; data: Row }) => {
        const idx = tables[model].findIndex((r) => matches(r, where))
        if (idx < 0) throw new Error('Record not found')
        const next = [...tables[model]]
        next[idx] = applyData(next[idx], data)
        checkUnique(model, next)
        tables[model] = next
        return { ...next[idx] }
      },
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        let count = 0
        const next = tables[model].map((r) => {
          if (!matches(r, where)) return r
          count++
          return applyData(r, data)
        })
        checkUnique(model, next)
        tables[model] = next
        return { count }
      },
    }
  }

  // Transactions run one at a time, like Postgres serialising writers on the
  // row lock a guarded UPDATE takes; otherwise a rollback here could restore a
  // snapshot taken before another transaction committed.
  let txQueue: Promise<unknown> = Promise.resolve()

  const db: any = {
    mfaRecoveryRequest: delegate('mfaRecoveryRequest'),
    mfaRecoveryOtp: delegate('mfaRecoveryOtp'),
    mfaRecoveryApprover: delegate('mfaRecoveryApprover'),
    mfaRecoveryAuditLog: delegate('mfaRecoveryAuditLog'),
    $transaction: (fn: (tx: any) => Promise<any>) => {
      const run = txQueue.then(async () => {
        const snapshot = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.map((r) => ({ ...r }))]))
        try {
          return await fn(db)
        } catch (error) {
          for (const k of Object.keys(tables)) tables[k] = snapshot[k]
          throw error
        }
      })
      txQueue = run.catch(() => undefined)
      return run
    },
  }

  return { db, tables, reset: () => { for (const k of Object.keys(tables)) tables[k] = [] } }
}

/** One instance shared by vi.mock factories and the spec (same module instance). */
export const sharedFake = createFakeDb()
