import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Minimal, deterministic fixture set for e2e / integration / latency tests.
 *
 * SAFETY: this script DELETES rows in dependency order then re-creates a small
 * known dataset, so it must only ever run against a disposable test database.
 * It refuses to run unless explicitly enabled:
 *
 *   TEST_SEED=1 npx tsx prisma/seed-test.ts
 *
 * Passwords are hashed the same way as prisma/seed.ts. Actual login flows are
 * driven by Supabase Auth (accounts table mirrors it), so provisioning real
 * credentials for e2e is done on the Auth side — this script only guarantees
 * the Prisma-side rows e2e asserts on exist.
 */

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function ensureEnabled() {
  if (process.env.TEST_SEED !== '1' && process.env.NODE_ENV !== 'test') {
    console.error(
      'Refusing to seed: set TEST_SEED=1 (or NODE_ENV=test) and point DATABASE_URL at a disposable test database.',
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
}

async function main() {
  await ensureEnabled();

  console.log('🌱 Seeding test fixtures...');

  // Clean in dependency order (children before parents).
  await prisma.$transaction([
    prisma.complaintAction.deleteMany(),
    prisma.complaint.deleteMany(),
    prisma.bannerContent.deleteMany(),
    prisma.bannerBooking.deleteMany(),
    prisma.notificationDelivery.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.deviceToken.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.redemption.deleteMany(),
    prisma.offerReplacementRequest.deleteMany(),
    prisma.merchantStatusHistory.deleteMany(),
    prisma.merchantBranch.deleteMany(),
    prisma.merchantOffer.deleteMany(),
    prisma.merchantReview.deleteMany(),
    prisma.banner.deleteMany(),
    prisma.companyBilling.deleteMany(),
    prisma.companyStatusHistory.deleteMany(),
    prisma.companyAdmin.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.merchant.deleteMany(),
    prisma.company.deleteMany(),
    prisma.adminUser.deleteMany(),
    prisma.account.deleteMany(),
    prisma.category.deleteMany(),
    prisma.theme.deleteMany(),
  ]);

  const now = new Date();
  const pw = await bcrypt.hash('Test@123456', SALT_ROUNDS);
  console.log('Test@123456 hash:', pw); // kept for parity with seed.ts

  // ── Categories ──────────────────────────────────────────
  const food = await prisma.category.create({
    data: { name: 'Food & Dining', slug: 'food-dining', icon: 'utensils', displayOrder: 0, isActive: true },
  });

  // ── Theme (so the app shell renders) ───────────────────
  await prisma.theme.upsert({
    where: { slug: 'default' },
    create: { name: 'Default', slug: 'default', isActive: true, settings: {} },
    update: {},
  });

  // ── Company ─────────────────────────────────────────────
  const acme = await prisma.company.create({
    data: {
      name: 'Acme Test Co',
      slug: 'acme-test-co',
      email: 'admin@acmetest.test',
      phone: '+357-25-000000',
      employeeCount: 12,
      status: 'ACTIVE',
      city: 'Limassol',
      country: 'Cyprus',
      industry: 'Technology',
      approvedDomain: 'acmetest.test',
      approvedAt: now,
    },
  });

  // ── Accounts + profiles ────────────────────────────────
  const superAdminAcct = await prisma.account.create({
    data: { email: 'superadmin@test.perks', role: 'SUPER_ADMIN', profileType: 'ADMIN', status: 'ACTIVE' },
  });
  await prisma.adminUser.create({
    data: {
      accountId: superAdminAcct.authUserId,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  const companyAdminAcct = await prisma.account.create({
    data: { email: 'companyadmin@acmetest.test', role: 'COMPANY_ADMIN', profileType: 'COMPANY', status: 'ACTIVE' },
  });
  await prisma.companyAdmin.create({
    data: {
      companyId: acme.id,
      accountId: companyAdminAcct.authUserId,
      firstName: 'Company',
      lastName: 'Admin',
      isPrimary: true,
      isActive: true,
    },
  });

  const employeeAcct = await prisma.account.create({
    data: { email: 'employee@acmetest.test', role: 'EMPLOYEE', profileType: 'EMPLOYEE', status: 'ACTIVE' },
  });
  await prisma.employee.create({
    data: {
      companyId: acme.id,
      accountId: employeeAcct.authUserId,
      firstName: 'Ada',
      lastName: 'Lovelace',
      employeeId: 'EMP-ACME-001',
      department: 'Engineering',
      status: 'ACTIVE',
      joinMethod: 'csv_import',
    },
  });

  const merchantAcct = await prisma.account.create({
    data: { email: 'merchant@acmetest.test', role: 'MERCHANT', profileType: 'MERCHANT', status: 'ACTIVE' },
  });
  const bakery = await prisma.merchant.create({
    data: {
      accountId: merchantAcct.authUserId,
      businessName: 'Acme Bakery',
      slug: 'acme-bakery',
      contactName: 'Baker',
      description: 'Test merchant for e2e suites',
      categoryId: food.id,
      status: 'ACTIVE',
      city: 'Limassol',
      country: 'Cyprus',
      approvedAt: now,
      liveAt: now,
    },
  });
  await prisma.merchantBranch.create({
    data: {
      merchantId: bakery.id,
      name: 'Acme Bakery — Limassol',
      addressLine1: '1 Main Street',
      city: 'Limassol',
      state: 'Limassol',
      postalCode: '3001',
      country: 'Cyprus',
      isActive: true,
      isPrimary: true,
      status: 'ACTIVE',
    },
  });

  // ── Live offer (searchable by the merchant offer selector) ──
  const later = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const offer = await prisma.merchantOffer.create({
    data: {
      merchantId: bakery.id,
      title: 'Free Coffee with Breakfast',
      offerType: 'flat_rate',
      categoryId: food.id,
      startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      endDate: later,
      status: 'LIVE',
      isFeatured: true,
      submittedAt: now,
      liveAt: now,
    },
  });
  await prisma.offerContent.create({
    data: {
      offerId: offer.id,
      description: 'Buy any breakfast item and get a free coffee.',
      shortDescription: 'Free coffee with breakfast',
      termsAndConditions: 'One per customer per day.',
    },
  });

  // ── Banner slot for the merchant booking flow ───────────
  const expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  await prisma.banner.create({
    data: {
      name: 'Home Top Banner (test)',
      description: 'Premium top-of-page banner slot — e2e fixture',
      position: 'TOP',
      displayOrder: 1,
      pricePerDay: 100,
      minDays: 1,
      maxDays: 30,
      slotCount: 3,
      isActive: true,
      expiresAt: expires,
    },
  });

  console.log('✅ Test fixtures seeded.');
  console.log({
    offerId: offer.id,
    merchantId: bakery.id,
    employee: 'employee@acmetest.test',
    merchant: 'merchant@acmetest.test',
    companyAdmin: 'companyadmin@acmetest.test',
    superAdmin: 'superadmin@test.perks',
    password: 'Test@123456',
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());