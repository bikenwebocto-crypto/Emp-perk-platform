// Single source of truth for "what can this account open".
//
// Used by the admin sidebar (which items to show), the middleware page/API guard
// (which /admin URLs and /api/admin calls to allow), the Accounts page and the
// Accounts API. Pure data + functions, no server imports, so it is safe in
// client components and the middleware.
//
// Role model (AdminUser.role):
//   SUPER_ADMIN   – everything, including creating/managing super admins
//   ADMIN         – everything, can manage admin accounts but never SUPER_ADMIN ones
//   SUPPORT_ADMIN – tickets + notifications only (cannot resolve/reject)
//   FINANCE_ADMIN – finance pages only
//   CONTENT_ADMIN – deprecated (migrated to ADMIN); never assignable
//
// Account.role is SUPER_ADMIN with profileType ADMIN for EVERY system admin, so it
// must never be used for permissions — always use AdminUser.role (adminRole).

export const ACCOUNT_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'MERCHANT', 'EMPLOYEE'] as const
export type AccountRoleValue = (typeof ACCOUNT_ROLES)[number]

export const PROFILE_TYPES = ['ADMIN', 'COMPANY', 'MERCHANT', 'EMPLOYEE'] as const
export type ProfileTypeValue = (typeof PROFILE_TYPES)[number]

/** Every value the AdminRole enum can hold (CONTENT_ADMIN kept for old rows). */
export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN', 'CONTENT_ADMIN'] as const
export type AdminRoleValue = (typeof ADMIN_ROLES)[number]

/** Roles that can be assigned to anyone today (CONTENT_ADMIN is deprecated). */
export const ACTIVE_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'] as const

/**
 * Normalise an AdminUser.role string. A missing or unknown role returns null and
 * gets NO access (fail closed). AdminUser.role is a required DB column, so a
 * null here means the caller forgot to pass it — it must never grant access.
 */
function normaliseAdminRole(adminRole: string | null | undefined): AdminRoleValue | null {
  return (ADMIN_ROLES as readonly string[]).includes(adminRole ?? '') ? (adminRole as AdminRoleValue) : null
}

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

// ─────────────────────────────────────────────────────────────
// Accounts (admin user management)
// ─────────────────────────────────────────────────────────────

/** Roles allowed to open the Accounts area and call the admin accounts API. */
export const ACCOUNTS_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const

/** Pages whose access is decided by canAccessAccounts. */
export const ACCOUNTS_PATHS = ['/admin/accounts']

export interface AccountActor {
  /** Email of the logged-in admin — used for the self-check. */
  email?: string | null
  /** AdminUser.role of the actor. */
  adminRole?: string | null
}

export interface AccountTarget {
  /** Email of the account being managed. */
  email: string
  /** AdminUser.role of the account being managed. */
  role: string | null | undefined
}

/**
 * May this actor open the Accounts area at all? SUPER_ADMIN or ADMIN, never an
 * inactive admin. isActive is optional: the sidebar/page don't know it, and the
 * middleware + API enforce active status.
 */
export function canAccessAccounts(actor: { adminRole?: string | null; isActive?: boolean }): boolean {
  if (actor.isActive === false) return false
  return (ACCOUNTS_ROLES as readonly string[]).includes(actor.adminRole ?? '')
}

/**
 * Roles this actor may hand out (create dialog, role dropdown, POST/PATCH API).
 * SUPER_ADMIN → all active roles; ADMIN → everything except SUPER_ADMIN.
 */
export function assignableRoles(actor: { adminRole?: string | null }): AdminRoleValue[] {
  if (actor.adminRole === 'SUPER_ADMIN') return ['SUPER_ADMIN', 'ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN']
  if (actor.adminRole === 'ADMIN') return ['ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN']
  return []
}

/**
 * May this actor change role / activate / deactivate / resend invite for target?
 * - never yourself (compared by email: AdminUser.id and Account.authUserId can differ)
 * - SUPER_ADMIN → anyone else (the API still blocks removing the last active super admin)
 * - ADMIN → anyone except SUPER_ADMIN accounts
 */
export function canManageTarget(actor: AccountActor, target: AccountTarget): boolean {
  if (!actor.email || actor.email.toLowerCase() === target.email.toLowerCase()) return false
  if (actor.adminRole === 'SUPER_ADMIN') return true
  if (actor.adminRole === 'ADMIN') return target.role !== 'SUPER_ADMIN'
  return false
}

// ─────────────────────────────────────────────────────────────
// Account role ↔ profile type
// ─────────────────────────────────────────────────────────────

/**
 * Login only works when role and profileType agree: the login sync picks the
 * dashboard from `role` and looks up the profile row from `profileType`.
 */
export const PROFILE_TYPE_FOR_ROLE: Record<AccountRoleValue, ProfileTypeValue> = {
  SUPER_ADMIN: 'ADMIN',
  COMPANY_ADMIN: 'COMPANY',
  MERCHANT: 'MERCHANT',
  EMPLOYEE: 'EMPLOYEE',
}

export function isValidRoleProfilePair(role: string, profileType: string): boolean {
  return PROFILE_TYPE_FOR_ROLE[role as AccountRoleValue] === profileType
}

/** Sidebar / dashboard section for a profile type. */
export const USER_TYPE_FOR_PROFILE: Record<ProfileTypeValue, 'admin' | 'company_admin' | 'merchant' | 'employee'> = {
  ADMIN: 'admin',
  COMPANY: 'company_admin',
  MERCHANT: 'merchant',
  EMPLOYEE: 'employee',
}

// ─────────────────────────────────────────────────────────────
// /admin page access
// ─────────────────────────────────────────────────────────────

/**
 * /admin pages each admin role may open (path prefixes). '*' = every page.
 * /admin/accounts is always decided by canAccessAccounts (see ACCOUNTS_PATHS),
 * even for '*' roles. Edit this table to change what each role sees and opens.
 */
export const ADMIN_ROLE_PATHS: Record<AdminRoleValue, '*' | string[]> = {
  SUPER_ADMIN: '*',
  ADMIN: '*',
  SUPPORT_ADMIN: ['/admin/complaints', '/admin/notifications'],
  FINANCE_ADMIN: [
    '/admin/analytics',
    '/admin/companies',
    '/admin/billing',
    '/admin/reports',
    '/admin/notifications',
  ],
  // Deprecated — existing rows were migrated to ADMIN. Kept so an unmigrated row
  // still gets its old pages instead of crashing.
  CONTENT_ADMIN: [
    '/admin/offers/deleted',
    '/admin/categories',
    '/admin/banners',
    '/admin/content',
    '/admin/themes',
    '/admin/settings/login-branding',
    '/admin/notifications',
  ],
}

/**
 * Roles that may open the /admin overview. SUPPORT_ADMIN is tickets-only, so it
 * lands on /admin/complaints instead (see adminLandingPath).
 */
export const ADMIN_OVERVIEW_ROLES: readonly AdminRoleValue[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'FINANCE_ADMIN',
  'CONTENT_ADMIN',
]

/**
 * Where an admin lands after login or when it hits a page it may not open.
 * Unknown role → /login (fail closed).
 */
export function adminLandingPath(adminRole: string | null | undefined): string {
  const role = normaliseAdminRole(adminRole)
  if (!role) return '/login'
  return ADMIN_OVERVIEW_ROLES.includes(role) ? '/admin' : '/admin/complaints'
}

/** Can an admin with this AdminRole open this /admin path? Unknown role → false. */
export function canAdminAccessPath(adminRole: string | null | undefined, pathname: string): boolean {
  const role = normaliseAdminRole(adminRole)
  if (!role) return false
  if (ACCOUNTS_PATHS.some((p) => matches(pathname, p))) return canAccessAccounts({ adminRole: role })
  if (pathname === '/admin') return ADMIN_OVERVIEW_ROLES.includes(role)
  const allowed = ADMIN_ROLE_PATHS[role]
  return allowed === '*' || allowed.some((p) => matches(pathname, p))
}

// ─────────────────────────────────────────────────────────────
// Ticket (complaint) actions
// ─────────────────────────────────────────────────────────────

export const TICKET_ACTIONS = [
  'ticket:view',
  'ticket:start_review',
  'ticket:reply',
  'ticket:request_clarification',
  'ticket:resolve',
  'ticket:reject',
] as const
export type TicketAction = (typeof TICKET_ACTIONS)[number]

/**
 * SUPER_ADMIN and ADMIN have full control; SUPPORT_ADMIN runs the conversation
 * but cannot resolve or reject. FINANCE_ADMIN / CONTENT_ADMIN cannot open the
 * Tickets page, so they get no ticket actions via the API either.
 */
const TICKET_ACTION_MATRIX: Record<AdminRoleValue, readonly TicketAction[]> = {
  SUPER_ADMIN: TICKET_ACTIONS,
  ADMIN: TICKET_ACTIONS,
  SUPPORT_ADMIN: ['ticket:view', 'ticket:start_review', 'ticket:reply', 'ticket:request_clarification'],
  FINANCE_ADMIN: [],
  CONTENT_ADMIN: [],
}

/** May this admin role perform this ticket action? Unknown role → false. */
export function canAdminDo(adminRole: string | null | undefined, action: TicketAction): boolean {
  const role = normaliseAdminRole(adminRole)
  return role ? TICKET_ACTION_MATRIX[role].includes(action) : false
}

// ─────────────────────────────────────────────────────────────
// /api/admin/* access
// ─────────────────────────────────────────────────────────────

/**
 * /api/admin/* paths a SUPPORT_ADMIN may still call. Everything else under
 * /api/admin is blocked for that role by the middleware API gate. Ticket APIs
 * live under /api/complaints/admin and are gated in-route by canAdminDo.
 */
export const SUPPORT_ADMIN_API_ALLOWLIST = [
  '/api/admin/sidebar-counts',
  '/api/admin/notifications',
] as const

/**
 * May this admin role call this /api/admin path? Unknown role → false.
 * Only SUPPORT_ADMIN is restricted here for now (FINANCE_ADMIN API limits are a
 * separate task). Broadcast announcements stay blocked for SUPPORT_ADMIN even
 * though they share the notifications prefix. The accounts API does its own
 * check via canAccessAccounts / assignableRoles / canManageTarget.
 */
export function canAdminCallApi(adminRole: string | null | undefined, pathname: string): boolean {
  const role = normaliseAdminRole(adminRole)
  if (!role) return false
  if (role !== 'SUPPORT_ADMIN') return true
  if (pathname.startsWith('/api/admin/notifications/announce')) return false
  return SUPPORT_ADMIN_API_ALLOWLIST.some((p) => matches(pathname, p))
}

// ─────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────

export const ADMIN_ROLE_LABELS: Record<AdminRoleValue, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  SUPPORT_ADMIN: 'Support Admin',
  FINANCE_ADMIN: 'Finance Admin',
  CONTENT_ADMIN: 'Content Admin (old)',
}

const USER_TYPE_LABELS: Record<string, string> = {
  merchant: 'Merchant',
  company_admin: 'Company Admin',
  employee: 'Employee',
}

export function getDisplayRole(user: { userType?: string | null; adminRole?: string | null }): string {
  if (user.userType === 'admin') {
    const role = normaliseAdminRole(user.adminRole)
    return role ? ADMIN_ROLE_LABELS[role] : ''
  }
  return USER_TYPE_LABELS[user.userType ?? ''] ?? ''
}