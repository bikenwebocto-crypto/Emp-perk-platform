import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
  prismaInitTime?: number;
  firstQueryDone?: boolean;
};

const isDev = process.env.NODE_ENV === 'development';

function getPool() {
  return (
    globalForPrisma.pgPool ??
    new Pool({ connectionString: process.env.DATABASE_URL })
  );
}

function initPrisma() {
  const initStart = performance.now();

  const pool = getPool();
  const adapter = new PrismaPg(pool);

  const client = new PrismaClient({
    adapter,
    log: isDev ? ['query', 'error', 'warn'] : ['error'],
  });

  if (isDev) {
    globalForPrisma.pgPool = pool;
    globalForPrisma.prismaInitTime = initStart;

    // @ts-expect-error - Prisma $on accepts 'query' even if TS complains
    client.$on('query', (e: any) => {
      if (!globalForPrisma.firstQueryDone) {
        const coldMs = performance.now() - (globalForPrisma.prismaInitTime ?? initStart);
        // console.log(`[COLD_START] First Prisma query executed ${coldMs.toFixed(1)}ms after Client init`);
        // console.log(`[COLD_START] SQL: ${e.query.substring(0, 120)}`);
        globalForPrisma.firstQueryDone = true;
      }
    });

    const initDuration = performance.now() - initStart;
    // console.log(`[COLD_START] PrismaClient instantiated in ${initDuration.toFixed(1)}ms`);
  } else {
    globalForPrisma.pgPool = pool;
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? initPrisma();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}