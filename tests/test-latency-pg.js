const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv4first')

const client = new Client({
  connectionString: "postgresql://postgres.ltsrzvdovqzzhybxgrmc:pEWEAQhZhzNXylQs@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
})

async function main() {
  const connectStart = Date.now()
  await client.connect()
  console.log(`Initial connect(): ${Date.now() - connectStart}ms`)
  console.log('---')
  for (let i = 0; i < 10; i++) {
    const start = Date.now()
    await client.query('SELECT 1')
    console.log(`Run ${i + 1}: ${Date.now() - start}ms`)
  }
  await client.end()
}
main()