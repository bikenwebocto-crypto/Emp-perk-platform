import { PrismaClient } from '@prisma/client';
import {
  seedLimassolMerchants,
  seedLimassolFoodMerchants,
  seedLimassolOffers,
} from './seed-limassol-merchants';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Reseeding Cyprus merchants & offers only (no destructive cleanup)...');

  await seedLimassolMerchants(prisma);
  await seedLimassolFoodMerchants(prisma);
  await seedLimassolOffers(prisma);

  console.log('✅ Merchant/offer reseed complete!');
}

main()
  .catch((e) => {
    console.error('Reseed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });