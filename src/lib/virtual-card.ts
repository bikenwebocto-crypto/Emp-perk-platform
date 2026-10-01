import { prisma } from '@/lib/prisma'

// VIRTUAL_CARD_AUTO_VERIFY: the employee shows an on-screen virtual card at
// the counter. The redemption is auto-verified at creation (like IN_STORE_QR
// and BOOKING_LINK), so it never enters the merchant's pending queue.
export const VIRTUAL_CARD_AUTO_VERIFY = 'VIRTUAL_CARD_AUTO_VERIFY' as const

export interface VirtualCardPayload {
  code: string | null
  holderName: string
  employeeNumber: string | null
  companyName: string | null
  merchantName: string
  offerTitle: string
  issuedAt: string
  verified: true
}

export async function buildVirtualCard(params: {
  employeeId: string
  merchantName: string
  offerTitle: string
  redemptionCode: string | null
  redeemedAt: Date | null
}): Promise<VirtualCardPayload> {
  const employee = await prisma.employee.findUnique({
    where: { id: params.employeeId },
    select: {
      firstName: true,
      lastName: true,
      employeeId: true,
      company: { select: { name: true } },
    },
  })

  return {
    code: params.redemptionCode,
    holderName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : '',
    employeeNumber: employee?.employeeId ?? null,
    companyName: employee?.company?.name ?? null,
    merchantName: params.merchantName,
    offerTitle: params.offerTitle,
    issuedAt: (params.redeemedAt ?? new Date()).toISOString(),
    verified: true,
  }
}
