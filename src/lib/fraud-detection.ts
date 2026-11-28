// Fraud detection service for voucher verification
// Detects suspicious patterns and abuse attempts

import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/services/audit-log.service'
import type { FraudDetectionResult, FraudFlagType, VoucherVerificationRequest } from '@/types/voucher'

interface AttemptRecord {
  code: string
  userId: string
  companyId?: string
  ipAddress?: string
  deviceId?: string
  result: 'SUCCESS' | 'FAILED' | 'FRAUD_DETECTED'
  timestamp: Date
}

// In-memory store for recent attempts (last 10 minutes)
// In production, this should be Redis or similar
const recentAttempts: AttemptRecord[] = []
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Clean up old attempts from memory
 */
function cleanupOldAttempts(): void {
  const cutoff = Date.now() - ATTEMPT_WINDOW_MS
  let first = recentAttempts[0]
  while (first && first.timestamp.getTime() < cutoff) {
    recentAttempts.shift()
    first = recentAttempts[0]
  }
}

/**
 * Clear all recent attempts (for testing)
 */
export function clearRecentAttempts(): void {
  recentAttempts.length = 0
}

/**
 * Add an attempt to the tracking store
 */
export function trackVerificationAttempt(attempt: AttemptRecord): void {
  cleanupOldAttempts()
  recentAttempts.push(attempt)
}

/**
 * Get recent attempts for a user
 */
function getUserAttempts(userId: string): AttemptRecord[] {
  cleanupOldAttempts()
  return recentAttempts.filter(a => a.userId === userId)
}

/**
 * Get recent attempts for an IP
 */
function getIpAttempts(ipAddress: string): AttemptRecord[] {
  cleanupOldAttempts()
  return recentAttempts.filter(a => a.ipAddress === ipAddress)
}

/**
 * Get recent attempts for a device
 */
function getDeviceAttempts(deviceId: string): AttemptRecord[] {
  cleanupOldAttempts()
  return recentAttempts.filter(a => a.deviceId === deviceId)
}

/**
 * Check for duplicate redemption attempts
 * Same user trying to redeem the same code multiple times
 */
async function checkDuplicateAttempts(request: VoucherVerificationRequest): Promise<FraudFlagType | null> {
  // Check in-memory recent attempts
  const userAttempts = getUserAttempts(request.userId)
  const duplicateAttempt = userAttempts.find(
    a => a.code === request.code && a.result === 'SUCCESS'
  )

  if (duplicateAttempt) {
    return 'DUPLICATE_ATTEMPT'
  }

  // Check database for actual redemptions
  const existingRedemption = await prisma.redemption.findFirst({
    where: {
      redemptionCode: request.code,
      employeeId: request.userId,
      isVerified: true,
    },
  })

  if (existingRedemption) {
    return 'DUPLICATE_ATTEMPT'
  }

  return null
}

/**
 * Check for rapid attempts
 * Too many verification attempts in a short time
 */
function checkRapidAttempts(request: VoucherVerificationRequest): FraudFlagType | null {
  const userAttempts = getUserAttempts(request.userId)
  
  // More than 10 attempts in 5 minutes is suspicious
  const recentWindow = userAttempts.filter(
    a => Date.now() - a.timestamp.getTime() < 5 * 60 * 1000
  )

  if (recentWindow.length > 10) {
    return 'RAPID_ATTEMPTS'
  }

  return null
}

/**
 * Check for brute force attempts
 * Many failed codes from the same user
 */
function checkBruteForceAttempts(request: VoucherVerificationRequest): FraudFlagType | null {
  const userAttempts = getUserAttempts(request.userId)
  
  // Count failed attempts in last 10 minutes
  const failedAttempts = userAttempts.filter(
    a => a.result === 'FAILED' && Date.now() - a.timestamp.getTime() < ATTEMPT_WINDOW_MS
  )

  // More than 20 failed attempts is brute force
  if (failedAttempts.length > 20) {
    return 'BRUTE_FORCE_ATTEMPT'
  }

  return null
}

/**
 * Check for code enumeration patterns
 * Sequential or similar codes being tested
 */
function checkCodeEnumeration(request: VoucherVerificationRequest): FraudFlagType | null {
  const userAttempts = getUserAttempts(request.userId)
  
  if (userAttempts.length < 5) {
    return null // Not enough data
  }

  // Get last 10 codes attempted
  const recentCodes = userAttempts
    .slice(-10)
    .map(a => a.code)

  // Check for sequential patterns (e.g., ABC123, ABC124, ABC125)
  let sequentialCount = 0
  for (let i = 1; i < recentCodes.length; i++) {
    const prev = recentCodes[i - 1]
    const curr = recentCodes[i]
    
    // Simple check: if codes differ by only last character(s)
    if (prev && curr && prev.slice(0, -2) === curr.slice(0, -2)) {
      sequentialCount++
    }
  }

  // If 3+ sequential patterns detected, flag as enumeration
  if (sequentialCount >= 3) {
    return 'CODE_ENUMERATION'
  }

  return null
}

/**
 * Check for excessive IP requests
 * Too many requests from the same IP
 */
function checkExcessiveIpRequests(request: VoucherVerificationRequest): FraudFlagType | null {
  if (!request.ipAddress) {
    return null
  }

  const ipAttempts = getIpAttempts(request.ipAddress)
  
  // More than 50 attempts from same IP in 10 minutes
  if (ipAttempts.length > 50) {
    return 'EXCESSIVE_IP_REQUESTS'
  }

  return null
}

/**
 * Check for suspicious device patterns
 * Multiple users from same device or other anomalies
 */
function checkSuspiciousDevice(request: VoucherVerificationRequest): FraudFlagType | null {
  if (!request.deviceId) {
    return null
  }

  const deviceAttempts = getDeviceAttempts(request.deviceId)
  
  // Count unique users from this device
  const uniqueUsers = new Set(deviceAttempts.map(a => a.userId))
  
  // If more than 5 different users from same device in 10 minutes, suspicious
  if (uniqueUsers.size > 5) {
    return 'SUSPICIOUS_DEVICE'
  }

  return null
}

/**
 * Check for cross-company abuse
 * User trying to use voucher from different company
 */
async function checkCrossCompanyAbuse(request: VoucherVerificationRequest): Promise<FraudFlagType | null> {
  if (!request.companyId) {
    return null
  }

  // Check if user belongs to the specified company
  const employee = await prisma.employee.findFirst({
    where: {
      id: request.userId,
      companyId: request.companyId,
      deletedAt: null,
    },
  })

  if (!employee) {
    // User doesn't belong to this company
    return 'CROSS_COMPANY_ABUSE'
  }

  return null
}

/**
 * Calculate overall risk score based on detected flags
 */
function calculateRiskScore(flags: FraudFlagType[]): number {
  const flagScores: Record<FraudFlagType, number> = {
    DUPLICATE_ATTEMPT: 30,
    RAPID_ATTEMPTS: 40,
    MULTIPLE_FAILED_CODES: 50,
    BRUTE_FORCE_ATTEMPT: 90,
    CODE_ENUMERATION: 80,
    EXCESSIVE_IP_REQUESTS: 60,
    SUSPICIOUS_DEVICE: 70,
    CROSS_COMPANY_ABUSE: 85,
  }

  // Sum scores, cap at 100
  const totalScore = flags.reduce((sum, flag) => sum + flagScores[flag], 0)
  return Math.min(100, totalScore)
}

/**
 * Run all fraud detection checks
 */
export async function detectFraud(
  request: VoucherVerificationRequest
): Promise<FraudDetectionResult> {
  const flags: FraudFlagType[] = []

  // Run all checks in parallel where possible
  const [
    duplicateFlag,
    crossCompanyFlag,
  ] = await Promise.all([
    checkDuplicateAttempts(request),
    checkCrossCompanyAbuse(request),
  ])

  // Synchronous checks
  const rapidFlag = checkRapidAttempts(request)
  const bruteForceFlag = checkBruteForceAttempts(request)
  const enumerationFlag = checkCodeEnumeration(request)
  const ipFlag = checkExcessiveIpRequests(request)
  const deviceFlag = checkSuspiciousDevice(request)

  // Collect all flags
  if (duplicateFlag) flags.push(duplicateFlag)
  if (rapidFlag) flags.push(rapidFlag)
  if (bruteForceFlag) flags.push(bruteForceFlag)
  if (enumerationFlag) flags.push(enumerationFlag)
  if (ipFlag) flags.push(ipFlag)
  if (deviceFlag) flags.push(deviceFlag)
  if (crossCompanyFlag) flags.push(crossCompanyFlag)

  const riskScore = calculateRiskScore(flags)
  const isFraudulent = riskScore >= 70 // Threshold for blocking

  return {
    isFraudulent,
    flags,
    riskScore,
    reason: isFraudulent ? `High risk score (${riskScore}) with flags: ${flags.join(', ')}` : undefined,
  }
}

/**
 * Log fraud detection result to audit log
 */
export async function logFraudDetection(
  request: VoucherVerificationRequest,
  result: FraudDetectionResult
): Promise<void> {
  if (result.flags.length === 0) {
    return // No fraud detected, no need to log
  }

  // The actor is the authenticated caller; the redemption's employee is the
  // subject. Fall back to the employee only for legacy callers that did not
  // supply a caller identity (buildAuditData still fails closed on no id).
  await createAuditLog({
    actorType: request.actorType ?? 'employee',
    actorId: request.actorProfileId ?? request.userId,
    companyId: request.companyId ?? null,
    action: 'VOUCHER_FRAUD_DETECTED',
    entityType: 'voucher_verification',
    entityId: request.userId,
    request: { ipAddress: request.ipAddress ?? null, userAgent: request.userAgent ?? null },
    metadata: {
      code: request.code,
      subjectEmployeeId: request.userId,
      merchantId: request.merchantId,
      deviceId: request.deviceId,
      fraudFlags: result.flags,
      riskScore: result.riskScore,
      reason: result.reason,
    },
  })
}
