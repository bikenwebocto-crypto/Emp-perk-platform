import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email'
import type { NotificationType } from '@/types/notification'
import type { Prisma } from '@prisma/client'
import type {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  NotificationEvent,
} from '@prisma/client'
import { PushService } from './push.service'

// ============================================================
// RECIPIENT TYPES
// ============================================================

export type RecipientRole = 'admin' | 'merchant' | 'company_admin' | 'employee'

export interface Recipient {
  role: RecipientRole
  id: string
}

// ============================================================
// PUBLISH OPTIONS
// ============================================================

export interface PublishNotificationOptions {
  type: NotificationType
  recipients: Recipient[]
  title: string
  message?: string
  priority?: NotificationPriority
  channels?: NotificationChannel[]
  referenceType?: string
  referenceId?: string
  metadata?: Record<string, unknown>
  /** Extra detail shown in the email body only (e.g. a rejection reason). */
  emailDetail?: string | null
  /** Call-to-action link in the email. Relative paths use NEXT_PUBLIC_APP_URL. */
  actionUrl?: string
  actionLabel?: string
}

export interface EmailDeliveryFailure {
  role: RecipientRole
  recipientId: string
  email: string | null
  reason: string
}

export interface EmailDeliverySummary {
  /** EMAIL was requested for this notification. */
  requested: boolean
  attempted: number
  sent: number
  failed: EmailDeliveryFailure[]
  /** EMAIL was requested but nobody could receive it (no recipients / all opted out). */
  noRecipients: boolean
}

export interface PublishResult {
  notifications: NotificationEvent[]
  email: EmailDeliverySummary
}

// ============================================================
// PREFERENCES
// ============================================================

export interface NotificationPreferenceRecord {
  id: string
  userId: string
  role: RecipientRole
  notificationType: string
  enableInApp: boolean
  enableEmail: boolean
  enablePush: boolean
  enableSms: boolean
}

// ============================================================
// NOTIFICATION SERVICE
// ============================================================

class NotificationServiceClass {
  /**
   * Publish a notification to one or more recipients.
   * This is the single entry point for all notification creation.
   */
  async publish(options: PublishNotificationOptions): Promise<NotificationEvent[]> {
    return (await this.publishDetailed(options)).notifications
  }

  /**
   * Same as publish, but waits for email delivery and reports which emails
   * failed, so callers can tell the admin an email was not delivered.
   */
  async publishDetailed(options: PublishNotificationOptions): Promise<PublishResult> {
    const {
      type,
      recipients,
      title,
      message,
      priority = 'NORMAL',
      channels = ['IN_APP'],
      referenceType,
      referenceId,
      metadata,
    } = options

    const emailRequested = channels.includes('EMAIL')
    const emailSummary: EmailDeliverySummary = {
      requested: emailRequested,
      attempted: 0,
      sent: 0,
      failed: [],
      noRecipients: false,
    }

    if (!recipients.length) {
      if (emailRequested) {
        emailSummary.noRecipients = true
        console.warn('[NotificationService] Email requested but there are no recipients', { type, title, referenceType, referenceId })
      }
      return { notifications: [], email: emailSummary }
    }

    const createdNotifications: NotificationEvent[] = []

    // Group recipients by role for batch processing
    const grouped = this.groupRecipients(recipients)

    // Recipients eligible for each delivery channel after preference filtering
    const pushRecipients: Recipient[] = []
    const emailRecipients: Recipient[] = []
    const smsRecipients: Recipient[] = []

    for (const [role, ids] of Object.entries(grouped)) {
      const roleKey = role as RecipientRole
      const preferenceMap = await this.loadPreferences(roleKey, ids, type)

      // Resolve which channels each recipient accepts, applying their
      // NotificationPreference (default: in-app, email, push on; SMS off).
      const channelsByRecipient = new Map<string, NotificationChannel[]>()
      for (const id of ids) {
        const enabled = this.resolveEnabledChannels(preferenceMap.get(id), channels)
        channelsByRecipient.set(id, enabled)
        const recipient: Recipient = { role: roleKey, id }
        if (enabled.includes('PUSH')) pushRecipients.push(recipient)
        if (enabled.includes('EMAIL')) emailRecipients.push(recipient)
        if (enabled.includes('SMS')) smsRecipients.push(recipient)
      }

      const notifications = await this.createForRole(
        roleKey,
        ids,
        { type, title, message, priority, channels, referenceType, referenceId },
        channelsByRecipient
      )
      createdNotifications.push(...notifications)
    }

    // Map each recipient back to the event created for them so the async
    // channel dispatchers can update per-channel delivery state.
    const recipientToNotification = new Map<string, NotificationEvent>()
    for (const notification of createdNotifications) {
      for (const [role, fkField] of Object.entries(this.getForeignKeyFields())) {
        const recipientId = (notification as any)[fkField]
        if (recipientId) {
          recipientToNotification.set(`${role}:${recipientId}`, notification)
          break
        }
      }
    }
    const notificationIdsFor = (list: Recipient[]): string[] =>
      list
        .map((r) => recipientToNotification.get(`${r.role}:${r.id}`)?.id)
        .filter((id): id is string => Boolean(id))

    // Dispatch push asynchronously (non-blocking)
    if (pushRecipients.length) {
      console.log('[NotificationService] Starting push delivery', {
        type,
        recipientCount: pushRecipients.length,
        title,
      })
      void PushService.sendToRecipients(pushRecipients, {
        title,
        body: message,
        data: {
          notificationType: type,
          ...(referenceType ? { referenceType } : {}),
          ...(referenceId ? { referenceId } : {}),
          ...this.stringifyMetadata(metadata),
        },
      })
        .then(async (result) => {
          console.log('[NotificationService] Push delivery result', {
            type,
            ...result,
          })
          const ids = notificationIdsFor(pushRecipients)
          const updated = await this.updateDeliveryStatus(
            ids,
            'PUSH',
            result.successful > 0 ? 'DELIVERED' : 'FAILED',
            result.successful > 0 ? undefined : result.errors?.[0]?.code
          )
          console.log('[NotificationService] Mobile push delivered & delivery record synced', {
            type,
            title,
            successful: result.successful,
            failed: result.failed,
            status: result.successful > 0 ? 'DELIVERED' : 'FAILED',
            deliveryRecordsUpdated: updated.count,
          })
          if (result.failed > 0) {
            console.error('[NotificationService] Push delivery partially failed:', result)
          }
        })
        .catch((err) => {
          console.error('[NotificationService] Push delivery failed:', err)
          void this.updateDeliveryStatus(
            notificationIdsFor(pushRecipients),
            'PUSH',
            'FAILED',
            String(err)
          )
        })
    }

    // Emails are awaited so failures can be reported back to the caller.
    if (emailRecipients.length) {
      try {
        const result = await this.dispatchEmails(createdNotifications, emailRecipients, options)
        emailSummary.attempted = result.attempted
        emailSummary.sent = result.sent
        emailSummary.failed = result.failed
      } catch (err) {
        console.error('[NotificationService] Email dispatch failed:', err)
        emailSummary.attempted = emailRecipients.length
        emailSummary.failed = emailRecipients.map((r) => ({
          role: r.role,
          recipientId: r.id,
          email: null,
          reason: err instanceof Error ? err.message : String(err),
        }))
      }
    } else if (emailRequested) {
      emailSummary.noRecipients = true
    }

    // No SMS provider is configured; record intent so delivery is auditable.
    if (smsRecipients.length) {
      void this.updateDeliveryStatus(
        notificationIdsFor(smsRecipients),
        'SMS',
        'SKIPPED',
        'SMS channel not configured'
      )
    }

    return { notifications: createdNotifications, email: emailSummary }
  }

  async adminRecipients(): Promise<Recipient[]> {
    const admins = await prisma.adminUser.findMany({ where: { isActive: true }, select: { id: true } })
    return admins.map((a) => ({ role: 'admin', id: a.id }))
  }

  async companyAdminRecipients(companyId: string): Promise<Recipient[]> {
    const admins = await prisma.companyAdmin.findMany({
      where: { companyId, isActive: true },
      select: { id: true },
    })
    return admins.map((a) => ({ role: 'company_admin', id: a.id }))
  }

  /**
   * Publish to all active admins.
   */
  async publishToAdmins(options: Omit<PublishNotificationOptions, 'recipients'>): Promise<NotificationEvent[]> {
    const admins = await prisma.adminUser.findMany({
      where: { isActive: true },
      select: { id: true },
    })
    return this.publish({
      ...options,
      recipients: admins.map((a) => ({ role: 'admin', id: a.id })),
    })
  }

  /**
   * Publish to a specific merchant.
   */
  async publishToMerchant(
    merchantId: string,
    options: Omit<PublishNotificationOptions, 'recipients'>
  ): Promise<NotificationEvent[]> {
    return this.publish({
      ...options,
      recipients: [{ role: 'merchant', id: merchantId }],
    })
  }

  /**
   * Publish to all active company admins.
   */
  async publishToCompanyAdmins(
    companyId: string,
    options: Omit<PublishNotificationOptions, 'recipients'>
  ): Promise<NotificationEvent[]> {
    const admins = await prisma.companyAdmin.findMany({
      where: { companyId, isActive: true },
      select: { id: true },
    })
    return this.publish({
      ...options,
      recipients: admins.map((a) => ({ role: 'company_admin', id: a.id })),
    })
  }

  /**
   * Publish to all active employees of a company.
   */
  async publishToEmployees(
    companyId: string,
    options: Omit<PublishNotificationOptions, 'recipients'>
  ): Promise<NotificationEvent[]> {
    const employees = await prisma.employee.findMany({
      where: { companyId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    })
    return this.publish({
      ...options,
      recipients: employees.map((e) => ({ role: 'employee', id: e.id })),
    })
  }

  /**
   * Publish to all active employees across the platform.
   * Used for marketplace-wide broadcasts such as "new offer published".
   */
  async publishToAllEmployees(
    options: Omit<PublishNotificationOptions, 'recipients'>
  ): Promise<NotificationEvent[]> {
    const employees = await prisma.employee.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    })
    return this.publish({
      ...options,
      recipients: employees.map((e) => ({ role: 'employee', id: e.id })),
    })
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private getForeignKeyFields(): Record<RecipientRole, string> {
    return {
      admin: 'adminId',
      merchant: 'merchantId',
      company_admin: 'companyAdminId',
      employee: 'employeeId',
    }
  }

  private getForeignKeyField(role: RecipientRole): string {
    return this.getForeignKeyFields()[role]
  }

  private async loadPreferences(
    role: RecipientRole,
    ids: string[],
    type: NotificationType
  ): Promise<Map<string, NotificationPreferenceRecord>> {
    if (!ids.length) return new Map()
    const rows = await prisma.notificationPreference.findMany({
      where: { role, notificationType: type, userId: { in: ids } },
    })
    const map = new Map<string, NotificationPreferenceRecord>()
    for (const row of rows) map.set(row.userId, row as NotificationPreferenceRecord)
    return map
  }

  private resolveEnabledChannels(
    pref: NotificationPreferenceRecord | undefined,
    requested: NotificationChannel[]
  ): NotificationChannel[] {
    const enabled: NotificationChannel[] = []
    if (requested.includes('IN_APP') && (pref ? pref.enableInApp : true)) {
      enabled.push('IN_APP')
    }
    if (requested.includes('EMAIL') && (pref ? pref.enableEmail : true)) {
      enabled.push('EMAIL')
    }
    if (requested.includes('PUSH') && (pref ? pref.enablePush : true)) {
      enabled.push('PUSH')
    }
    if (requested.includes('SMS') && (pref ? pref.enableSms : false)) {
      enabled.push('SMS')
    }
    return enabled
  }

  private groupRecipients(recipients: Recipient[]): Record<RecipientRole, string[]> {
    const grouped: Record<RecipientRole, string[]> = {
      admin: [],
      merchant: [],
      company_admin: [],
      employee: [],
    }
    for (const r of recipients) {
      grouped[r.role].push(r.id)
    }
    return grouped
  }

  private async createForRole(
    role: RecipientRole,
    ids: string[],
    data: {
      type: NotificationType
      title: string
      message?: string
      priority: NotificationPriority
      channels: NotificationChannel[]
      referenceType?: string
      referenceId?: string
    },
    channelsByRecipient: Map<string, NotificationChannel[]>
  ): Promise<NotificationEvent[]> {
    if (!ids.length) return []

    const foreignKey = this.getForeignKeyField(role)

    // Only recipients that kept at least one enabled channel get an event record.
    const recipientsWithChannels = ids.filter(
      (id) => (channelsByRecipient.get(id)?.length ?? 0) > 0
    )
    if (!recipientsWithChannels.length) return []

    let targetIds = recipientsWithChannels
    if (data.referenceId) {
      const existing = await prisma.notificationEvent.findMany({
        where: {
          referenceId: data.referenceId,
          title: data.title,
          AND: [
            { OR: [{ type: data.type }, { referenceType: data.type }] },
            { OR: recipientsWithChannels.map((id) => ({ [foreignKey]: id })) },
          ],
        },
        select: { [foreignKey]: true } as any,
      })
      const existingIds = new Set(existing.map((row) => (row as any)[foreignKey]))
      targetIds = recipientsWithChannels.filter((id) => !existingIds.has(id))
    }
    if (!targetIds.length) return []

    const now = new Date()

    // Build batch insert payloads
    const payloads = targetIds.map((id) => {
      const channels = channelsByRecipient.get(id) ?? []
      return {
        recipientType: role,
        [foreignKey]: id,
        title: data.title,
        body: data.message ?? null,
        channel: channels[0] ?? 'IN_APP',
        priority: data.priority,
        type: data.type,
        referenceType: data.referenceType ?? null,
        referenceId: data.referenceId ?? null,
        isRead: false,
        sentAt: now,
      }
    })

    // Batch insert using createMany for performance
    const result = await prisma.notificationEvent.createMany({
      data: payloads,
      skipDuplicates: true,
    })

    if (!result.count) return []

    // Fetch created records (createMany doesn't return them)
    // Use a findMany with the same conditions
    const created = await prisma.notificationEvent.findMany({
      where: {
        type: data.type,
        referenceType: data.referenceType ?? null,
        referenceId: data.referenceId ?? null,
        createdAt: { gte: new Date(now.getTime() - 1000) },
        OR: targetIds.map((id) => ({
          [foreignKey]: id,
        })),
      },
      orderBy: { createdAt: 'desc' },
      take: result.count,
    })

    // Record per-channel delivery state.
    const deliveryData: Prisma.NotificationDeliveryCreateManyInput[] = []
    for (const notification of created) {
      const recipientId = (notification as any)[foreignKey] as string | undefined
      if (!recipientId) continue
      const channels = channelsByRecipient.get(recipientId) ?? []
      for (const channel of channels) {
        if (channel === 'IN_APP') {
          deliveryData.push({
            notificationId: notification.id,
            channel,
            status: 'DELIVERED',
            sentAt: now,
            deliveredAt: now,
          })
        } else {
          deliveryData.push({ notificationId: notification.id, channel, status: 'PENDING' })
        }
      }
    }
    if (deliveryData.length) {
      await prisma.notificationDelivery.createMany({ data: deliveryData })
    }

    return created
  }

  private async updateDeliveryStatus(
    notificationIds: string[],
    channel: NotificationChannel,
    status: NotificationDeliveryStatus,
    error?: string
  ): Promise<{ count: number }> {
    const uniqueIds = [...new Set(notificationIds.filter(Boolean))]
    if (!uniqueIds.length) return { count: 0 }
    const now = new Date()
    const data: Prisma.NotificationDeliveryUpdateManyMutationInput = { status }
    if (status === 'DELIVERED') {
      data.sentAt = now
      data.deliveredAt = now
    } else if (status !== 'SKIPPED') {
      data.sentAt = now
    }
    if (error) data.error = error
    const result = await prisma.notificationDelivery.updateMany({
      where: { notificationId: { in: uniqueIds }, channel },
      data,
    })
    console.log(`[NotificationService] Delivery record updated: ${channel} -> ${status}`, {
      channel,
      status,
      recordsUpdated: result.count,
      error: error ?? null,
    })
    return result
  }

  private async dispatchEmails(
    notifications: NotificationEvent[],
    recipients: Recipient[],
    options: Pick<PublishNotificationOptions, 'emailDetail' | 'actionUrl' | 'actionLabel'>
  ): Promise<{ attempted: number; sent: number; failed: EmailDeliveryFailure[] }> {
    // Deduplicate recipients
    const uniqueRecipients = [...new Map(recipients.map((r) => [`${r.role}:${r.id}`, r])).values()]

    let sent = 0
    const failures: EmailDeliveryFailure[] = []

    for (const recipient of uniqueRecipients) {
      const notification = notifications.find((n) => {
        const fkField = this.getForeignKeyField(recipient.role)
        return (n as any)[fkField] === recipient.id
      })
      if (!notification) {
        failures.push({ role: recipient.role, recipientId: recipient.id, email: null, reason: 'Notification record was not created' })
        continue
      }

      const email = await this.lookupEmail(recipient)
      if (!email) {
        const reason = 'No email address on the linked account'
        console.error('[NotificationService] Email not delivered', { recipient, notificationId: notification.id, reason })
        failures.push({ role: recipient.role, recipientId: recipient.id, email: null, reason })
        await this.updateDeliveryStatus([notification.id], 'EMAIL', 'FAILED', reason)
        continue
      }

      let reason: string | null = null
      try {
        // sendEmail returns { success: false } instead of throwing, so check it.
        const result = await emailService.sendEmail({
          to: email,
          subject: notification.title,
          html: this.buildEmailHtml(notification, options),
        })
        if (!result.success) reason = result.error ??'Email provider rejected the message'
      } catch (err) {
        reason = err instanceof Error ? err.message : String(err)
      }

      if (reason) {
        console.error('[NotificationService] Email not delivered', { recipient, email, notificationId: notification.id, reason })
        failures.push({ role: recipient.role, recipientId: recipient.id, email, reason })
        await this.updateDeliveryStatus([notification.id], 'EMAIL', 'FAILED', reason.slice(0, 500))
        continue
      }

      sent++
      await this.updateDeliveryStatus([notification.id], 'EMAIL', 'DELIVERED')
      // Mark the event as delivered for backward compatibility
      await prisma.notificationEvent.update({
        where: { id: notification.id },
        data: { deliveredAt: new Date() },
      })
    }

    return { attempted: uniqueRecipients.length, sent, failed: failures }
  }

  private async lookupEmail(recipient: Recipient): Promise<string | null> {
    try {
      const fkField = this.getForeignKeyField(recipient.role)
      const profileModel = this.getProfileModel(recipient.role)

      const profile = await (prisma as any)[profileModel].findUnique({
        where: { id: recipient.id },
        select: { accountId: true },
      })
      if (!profile?.accountId) return null

      const account = await prisma.account.findUnique({
        where: { authUserId: profile.accountId },
        select: { email: true },
      })
      return account?.email ?? null
    } catch {
      return null
    }
  }

  private getProfileModel(role: RecipientRole): string {
    const map: Record<RecipientRole, string> = {
      admin: 'adminUser',
      merchant: 'merchant',
      company_admin: 'companyAdmin',
      employee: 'employee',
    }
    return map[role]
  }

  private buildEmailHtml(
    notification: NotificationEvent,
    options: Pick<PublishNotificationOptions, 'emailDetail' | 'actionUrl' | 'actionLabel'> = {}
  ): string {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
    const actionHref = options.actionUrl
      ? /^https?:\/\//.test(options.actionUrl)
        ? options.actionUrl
        : appUrl
          ? `${appUrl}${options.actionUrl.startsWith('/') ? '' : '/'}${options.actionUrl}`
          : null
      : null
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f8fafc; border-radius: 8px; padding: 24px; border: 1px solid #e2e8f0;">
          <h2 style="color: #1e293b; margin: 0 0 12px;">${esc(notification.title)}</h2>
          ${notification.body ? `<p style="color: #475569; line-height: 1.6; margin: 0;">${esc(notification.body)}</p>` : ''}
          ${options.emailDetail ? `<p style="color: #1e293b; line-height: 1.6; margin: 12px 0 0; padding: 12px; background: #fff; border-left: 3px solid #f59e0b;">${esc(options.emailDetail)}</p>` : ''}
          ${actionHref ? `<p style="margin: 20px 0 0;"><a href="${esc(actionHref)}" style="display: inline-block; background: #1e293b; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px;">${esc(options.actionLabel ?? 'Sign in')}</a></p>` : ''}
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            Priority: ${notification.priority} · ${new Date(notification.createdAt).toLocaleDateString()}
          </p>
        </div>
      </body>
      </html>
    `
  }

  private stringifyMetadata(metadata?: Record<string, unknown>): Record<string, string> {
    if (!metadata) return {}
    return Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      ])
    )
  }
}

export const NotificationService = new NotificationServiceClass()
