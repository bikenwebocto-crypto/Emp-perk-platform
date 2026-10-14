import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

/**
 * Exercises the `leads_link_matches_type` CHECK constraint added by
 * 20261005000000_add_leads_table against a real PostgreSQL instance, because the
 * invariant cannot be expressed in the Prisma schema.
 *
 * Requires TEST_DATABASE_URL pointed at a disposable test database that has had
 * `prisma migrate deploy` applied. Skipped when the variable is unset.
 */
const connectionString = process.env.TEST_DATABASE_URL
const describeIfDb = connectionString ? describe : describe.skip

function prismaFor(url: string) {
  return new PrismaClient({
    datasources: { db: { url } },
    log: [],
  })
}

const merchantFixture = { businessName: 'Lead Constraint Merchant', slug: 'lead-constraint-merchant', contactName: 'Fixture Owner' }
const companyFixture = { name: 'Lead Constraint Company', slug: 'lead-constraint-company', email: 'lead-constraint-company@test.invalid' }

let prisma: PrismaClient
let merchantId = ''
let companyId = ''

async function insertLead(type: 'MERCHANT' | 'EMPLOYER', link: { merchantId?: string; companyId?: string }) {
  return prisma.lead.create({
    data: {
      type,
      firstName: 'Lead',
      lastName: 'Person',
      email: `${type.toLowerCase()}-${Math.random().toString(36).slice(2)}@leads.test`,
      companyName: 'Lead Co',
      ...link,
    },
  })
}

describeIfDb('leads_link_matches_type check constraint', () => {
  beforeAll(async () => {
    prisma = prismaFor(connectionString as string)

    const merchant = await prisma.merchant.create({ data: merchantFixture })
    const company = await prisma.company.create({ data: companyFixture })
    merchantId = merchant.id
    companyId = company.id
  })

  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { companyName: 'Lead Co' } })
    await prisma.merchant.delete({ where: { id: merchantId } })
    await prisma.company.delete({ where: { id: companyId } })
    await prisma.$disconnect()
  })

  it('defaults cities to an empty array when the field is omitted', async () => {
    const lead = await insertLead('MERCHANT', {})

    expect(lead.cities).toEqual([])
    await prisma.lead.delete({ where: { id: lead.id } })
  })

  it('accepts a MERCHANT lead linked only to a merchant', async () => {
    const lead = await insertLead('MERCHANT', { merchantId })

    expect(lead.merchantId).toBe(merchantId)
    await prisma.lead.delete({ where: { id: lead.id } })
  })

  it('accepts an EMPLOYER lead linked only to a company', async () => {
    const lead = await insertLead('EMPLOYER', { companyId })

    expect(lead.companyId).toBe(companyId)
    await prisma.lead.delete({ where: { id: lead.id } })
  })

  it('accepts an unlinked lead of either type', async () => {
    const merchant = await insertLead('MERCHANT', {})
    const employer = await insertLead('EMPLOYER', {})

    expect(merchant.merchantId).toBeNull()
    expect(employer.companyId).toBeNull()
    await prisma.lead.deleteMany({ where: { id: { in: [merchant.id, employer.id] } } })
  })

  it('rejects a lead linked to both a merchant and a company', async () => {
    await expect(insertLead('MERCHANT', { merchantId, companyId })).rejects.toThrow(/leads_link_matches_type/)
    await expect(insertLead('EMPLOYER', { merchantId, companyId })).rejects.toThrow(/leads_link_matches_type/)
  })

  it('rejects a MERCHANT lead linked to a company and an EMPLOYER lead linked to a merchant', async () => {
    await expect(insertLead('MERCHANT', { companyId })).rejects.toThrow(/leads_link_matches_type/)
    await expect(insertLead('EMPLOYER', { merchantId })).rejects.toThrow(/leads_link_matches_type/)
  })
})