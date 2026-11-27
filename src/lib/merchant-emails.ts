import { prisma } from '@/lib/prisma'
import { firstName } from '@/emails/templates/merchant'

/** Name fields every merchant email (spec M-xx) needs. */
export async function merchantEmailBase(merchantId: string): Promise<{ firstName: string; businessName: string }> {
  const m = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { contactName: true, businessName: true },
  })
  return { firstName: firstName(m?.contactName), businessName: m?.businessName ?? 'your business' }
}
