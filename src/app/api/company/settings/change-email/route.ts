import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/services/audit-log.service'
import { getCompanyAdmin, handleApiError } from '../../helpers'
import { sendCompanyAdminInvitation } from '@/services/company-admin-invitation.service'

export async function POST(request: NextRequest) {
  try {
    const { company, companyAdmin } = await getCompanyAdmin()
    const body = await request.json()
    const { newEmail, otp } = body
    console.log('[COMPANY_ADMIN_EMAIL][ROUTE] POST /api/company/settings/change-email', { companyId: company.id, companyAdminId: companyAdmin.id, newEmail })

    if (!newEmail) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'New email is required' } },
        { status: 400 },
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_EMAIL', message: 'Invalid email address' } },
        { status: 400 },
      )
    }

    const currentAcct = await prisma.account.findUnique({
      where: { authUserId: companyAdmin.accountId! },
      select: { email: true },
    })
    const oldEmail = currentAcct?.email
    console.log('[EMAIL_CHANGE_CHECK]', { currentEmail: oldEmail, newEmail: newEmail?.toLowerCase().trim(), changed: newEmail?.toLowerCase().trim() !== oldEmail })

    if (newEmail.toLowerCase().trim() === oldEmail) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_CHANGE', message: 'New email is the same as the current email' } },
        { status: 400 },
      )
    }

    const existing = await prisma.account.findUnique({ where: { email: newEmail.toLowerCase().trim() } })
    if (existing && existing.authUserId !== companyAdmin.accountId) {
      return NextResponse.json(
        { success: false, error: { code: 'EMAIL_EXISTS', message: 'This email is already in use' } },
        { status: 409 },
      )
    }

    const normalizedEmail = newEmail.toLowerCase().trim()
    await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { authUserId: companyAdmin.accountId! },
        data: { email: normalizedEmail },
      })

      await createAuditLog({
        actorType: 'company_admin',
        actorId: companyAdmin.id,
        action: 'EMAIL_CHANGED',
        entityType: 'COMPANY_ADMIN',
        entityId: companyAdmin.id,
        changes: { to: normalizedEmail },
      }, tx)
    })

    console.log('[COMPANY_ADMIN_EMAIL][ROUTE] Email updated, calling invitation service', { email: normalizedEmail, companyName: company.name, firstName: companyAdmin.firstName })
    const invite = await sendCompanyAdminInvitation({
      adminId: companyAdmin.id,
      email: normalizedEmail,
      firstName: companyAdmin.firstName,
      lastName: companyAdmin.lastName,
      companyName: company.name ?? '',
      companyId: company.id,
      actorType: 'company_admin',
      actorId: companyAdmin.id,
    })

    return NextResponse.json({
      success: true,
      emailSent: invite.success,
      message: invite.success
        ? 'Email changed successfully'
        : 'Email changed, but the confirmation email to the new address could not be sent.',
    })
  } catch (error) {
    return handleApiError(error)
  }
}
