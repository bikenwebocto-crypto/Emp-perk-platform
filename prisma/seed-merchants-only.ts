import { PrismaClient } from '@prisma/client';
import {
  seedLimassolMerchants,
  seedLimassolFoodMerchants,
  seedLimassolOffers,
} from './seed-limassol-merchants';

const prisma = new PrismaClient();

async function main() {
  await seedLimassolMerchants(prisma);
  await seedLimassolFoodMerchants(prisma);
  await seedLimassolOffers(prisma);

}

main()
  .catch((e) => {
    console.error('Reseed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });