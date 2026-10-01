import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/services/audit-log.service'
import { getEmployeeFromSession, unauthorized, internalError, companyInactive, notFound, badRequest } from '@/lib/employee-session'
import { getCurrentUser } from '@/lib/supabase/server'

const ADDRESS_FIELDS = ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'] as const

function projectAddress(addr: { addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null } | null) {
  if (!addr) return null
  return {
    addressLine1: addr.addressLine1,
    addressLine2: addr.addressLine2,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postalCode,
    country: addr.country,
  }
}

export async function GET() {
  try {
    const employee = await getEmployeeFromSession()
    if (!employee) return unauthorized()
    if ('inactive' in employee) return companyInactive(employee.companyStatus)
    const full = await prisma.employee.findUnique({
      where: { id: employee.id },
      include: {
        account: { select: { email: true } },
        address: true,
        company: { select: { id: true, name: true, approvedDomain: true } },
      },
    })
    if (!full) return notFound('Employee not found')
    const data = {
      ...full,
      email: full.account?.email ?? '',
      address: projectAddress(full.address),
    }
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return internalError(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession()
    if (!employee) return unauthorized()
    if ('inactive' in employee) return companyInactive(employee.companyStatus)
    const user = await getCurrentUser()
    const body = await request.json()

    const personalFields = ['firstName', 'lastName', 'phone', 'jobTitle', 'department', 'avatarUrl'] as const
    const personalUpdate: Record<string, unknown> = {}
    for (const f of personalFields) {
      if (body[f] !== undefined) personalUpdate[f] = body[f]
    }

    // Address can arrive as a nested object { address: { city, ... } } or as flat top-level fields
    const addressInput: Record<string, unknown> = {}
    if (body.address && typeof body.address === 'object') {
      for (const f of ADDRESS_FIELDS) {
        if ((body.address as Record<string, unknown>)[f] !== undefined) {
          addressInput[f] = (body.address as Record<string, unknown>)[f]
        }
      }
    } else {
      for (const f of ADDRESS_FIELDS) {
        if (body[f] !== undefined) addressInput[f] = body[f]
      }
    }

    if (Object.keys(personalUpdate).length === 0 && Object.keys(addressInput).length === 0) {
      return NextResponse.json({ success: true, message: 'No changes' })
    }
    if (personalUpdate.firstName !== undefined && (!personalUpdate.firstName || String(personalUpdate.firstName).trim().length < 1)) {
      return badRequest('First name is required')
    }
    if (personalUpdate.lastName !== undefined && (!personalUpdate.lastName || String(personalUpdate.lastName).trim().length < 1)) {
      return badRequest('Last name is required')
    }

    if (Object.keys(personalUpdate).length > 0) {
      await prisma.employee.update({
        where: { id: employee.id },
        data: personalUpdate,
      })
    }

    if (Object.keys(addressInput).length > 0) {
      await prisma.employeeAddress.upsert({
        where: { employeeId: employee.id },
        create: {
          employeeId: employee.id,
          addressLine1: (addressInput.addressLine1 as string) ?? null,
          addressLine2: (addressInput.addressLine2 as string) ?? null,
          city: (addressInput.city as string) ?? null,
          state: (addressInput.state as string) ?? null,
          postalCode: (addressInput.postalCode as string) ?? null,
          country: (addressInput.country as string) ?? null,
        },
        update: addressInput,
      })
    }

    const updated = await prisma.employee.findUnique({
      where: { id: employee.id },
      include: {
        account: { select: { email: true } },
        address: true,
        company: { select: { id: true, name: true, approvedDomain: true } },
      },
    })
    if (!updated) return notFound('Employee not found')
    await createAuditLog({
      actorType: 'employee',
      actorId: employee.id,
      action: 'EMPLOYEE_PROFILE_UPDATED',
      entityType: 'employee',
      entityId: employee.id,
      metadata: {
        changed: Object.keys(personalUpdate),
        addressChanged: Object.keys(addressInput),
      },
    })
    const data = {
      ...updated,
      email: updated.account?.email ?? '',
      address: projectAddress(updated.address),
    }
    return NextResponse.json({ success: true, data, userId: user?.id })
  } catch (error) {
    return internalError(error)
  }
}
