/**
 * Launch Pack + reminder workflows.
 *
 * Uses the centralized NotificationService for all notification creation.
 */

import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/services/audit-log.service'
import { NotificationService } from '@/services/notification.service'
import { emailWarningFor } from '@/services/business-notification.service'

export async function sendLaunchPack(companyId: string, profileId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { companyAdmins: { where: { isActive: true } } },
  })
  if (!company) {
    throw new Error('Company not found')
  }

  // Mark the activation transition with a CompanyStatusHistory entry
  await createAuditLog({
    actorType: 'admin',
    actorId: profileId,
    action: 'LAUNCH_PACK_SENT',
    entityType: 'company',
    entityId: companyId,
    metadata: {
      adminCount: company.companyAdmins.length,
    },
  })

  // Send welcome notifications to company admins
  // This is the single activation email for company admins (callers must not
  // send a separate "company approved" email on first activation).
  const adminIds = company.companyAdmins.map((a) => a.id)
  const options = {
    type: 'LAUNCH_PACK' as const,
    recipients: adminIds.map((id) => ({ role: 'company_admin' as const, id })),
    title: `Welcome to ${company.name} on the platform`,
    message: `Your account is ready. Sign in to manage your team and start exploring offers.`,
    priority: 'NORMAL' as const,
    channels: ['IN_APP' as const, 'EMAIL' as const],
    referenceType: 'launch_pack',
    referenceId: companyId,
    actionUrl: '/login',
    actionLabel: 'Sign in',
  }
  const { email } = await NotificationService.publishDetailed(options)
  const emailWarning = emailWarningFor(email, options.title)

  // Send to all active employees
  await NotificationService.publishToEmployees(companyId, {
    type: 'LAUNCH_PACK',
    title: `Welcome to ${company.name} on the platform`,
    message: `Your account is ready. Sign in to view available offers.`,
    priority: 'NORMAL',
    channels: ['IN_APP'],
    referenceType: 'launch_pack',
    referenceId: companyId,
  })

  return {
    adminCount: adminIds.length,
    emailWarning,
  }
}

export async function sendBillingReminder(companyId: string, profileId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { companyAdmins: { where: { isActive: true } } },
  })
  if (!company) {
    throw new Error('Company not found')
  }

  await createAuditLog({
    actorType: 'admin',
    actorId: profileId,
    action: 'BILLING_REMINDER_SENT',
    entityType: 'company',
    entityId: companyId,
    metadata: { billingStatus: 'INVOICE_OVERDUE' },
  })

  // Send to all company admins
  const adminIds = company.companyAdmins.map((a) => a.id)
  if (adminIds.length > 0) {
    await NotificationService.publish({
      type: 'BILLING_REMINDER',
      recipients: adminIds.map((id) => ({ role: 'company_admin', id })),
      title: `Payment overdue: ${company.name}`,
      message: `Your invoice is overdue. Please settle the balance to avoid service interruption.`,
      priority: 'HIGH',
      channels: ['IN_APP', 'EMAIL'],
      referenceType: 'billing_reminder',
      referenceId: companyId,
    })
  }
}
