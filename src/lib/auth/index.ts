export type {
  AuthContext,
  AuthResult,
  Role,
  ProfileType,
  AuthProfile,
} from './types'

export {
  authContextStore,
  getAuthContext,
} from './context-store'

export {
  authenticateFromCookies,
  authenticateFromBearer,
  authenticateFromRequest,
} from './authenticate'

export {
  buildAuthContext,
} from './build-context'

export {
  AuthError,
  ForbiddenError,
  requireRole,
  requireProfileType,
  requireActive,
  requireCompany,
  requireAdmin,
  requireMerchant,
  requireEmployee,
  requireCompanyAdmin,
} from './guards'

export {
  PRIVILEGED_MFA_ROLES,
  requiresMfaForRole,
  hasVerifiedTotpFactor,
  isAal2,
} from './mfa'
