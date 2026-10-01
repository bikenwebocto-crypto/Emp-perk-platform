// test-latency.js
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')
const dns = require('dns')

dns.setDefaultResultOrder('ipv4first')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const connectStart = Date.now()
  await prisma.$connect()
  console.log(`Initial $connect(): ${Date.now() - connectStart}ms`)
  console.log('---')

  for (let i = 0; i < 10; i++) {
    const start = Date.now()
    await prisma.$queryRaw`SELECT 1`
    console.log(`Run ${i + 1}: ${Date.now() - start}ms`)
  }

  await prisma.$disconnect()
  await pool.end()
}

main()