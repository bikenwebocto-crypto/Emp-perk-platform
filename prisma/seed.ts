import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  seedLimassolMerchants,
  seedLimassolFoodMerchants,
  seedLimassolOffers,
} from './seed-limassol-merchants';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function main() {
  console.log('🌱 Seeding database (Cyprus edition)...');

  // Clean existing data in dependency order (children before parents)
  await prisma.$transaction([
    prisma.complaintAction.deleteMany(),
    prisma.complaintEscalation.deleteMany(),
    prisma.complaint.deleteMany(),

    prisma.bannerContent.deleteMany(),
    prisma.bannerBooking.deleteMany(),
    prisma.banner.deleteMany(),

    prisma.merchantReview.deleteMany(),
    prisma.offerView.deleteMany(),
    prisma.dailyOfferAnalytics.deleteMany(),

    prisma.notificationDelivery.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.deviceToken.deleteMany(),

    prisma.renewalGamingAlert.deleteMany(),
    prisma.realtimeEvent.deleteMany(),
    prisma.emailVerificationToken.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.loginSession.deleteMany(),
    prisma.notificationEvent.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.cSVRejectedRow.deleteMany(),
    prisma.cSVUploadJob.deleteMany(),
    prisma.mostPopularMerchant.deleteMany(),
    prisma.weeklyPick.deleteMany(),
    prisma.heroBanner.deleteMany(),
    prisma.actionQueueItem.deleteMany(),
    prisma.issueReport.deleteMany(),
    prisma.redemptionAnalytics.deleteMany(),
    prisma.redemption.deleteMany(),
    prisma.offerReplacementRequest.deleteMany(),
    prisma.merchantProfileEditRequest.deleteMany(),
    prisma.merchantOffer.deleteMany(), // cascades content/pricing/redemption/review/analytics
    prisma.merchantBranch.deleteMany(),
    prisma.merchantStatusHistory.deleteMany(),
    prisma.merchant.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.companyAdmin.deleteMany(),
    prisma.companyBilling.deleteMany(),
    prisma.companyStatusHistory.deleteMany(),
    prisma.company.deleteMany(),
    prisma.adminUser.deleteMany(),
    prisma.account.deleteMany(),
    prisma.category.deleteMany(),
    prisma.platformSettings.deleteMany(),

    prisma.loginBranding.deleteMany(),
    prisma.theme.deleteMany(),
  ]);

  const pw = await hashPassword('Test@123456');

  // ── Admins ─────────────────────────────────────────────
  const superAdminAccount = await prisma.account.create({
    data: { email: 'admin@perks.com', role: 'SUPER_ADMIN', profileType: 'ADMIN', status: 'ACTIVE' },
  });
  const superAdmin = await prisma.adminUser.create({
    data: { accountId: superAdminAccount.authUserId, firstName: 'Super', lastName: 'Admin', role: 'SUPER_ADMIN', isActive: true },
  });

  const supportAdminAccount = await prisma.account.create({
    data: { email: 'support@perks.com', role: 'SUPER_ADMIN', profileType: 'ADMIN', status: 'ACTIVE' },
  });
  const supportAdmin = await prisma.adminUser.create({
    data: { accountId: supportAdminAccount.authUserId, firstName: 'Support', lastName: 'Agent', role: 'SUPPORT_ADMIN', isActive: true },
  });

  const financeAdminAccount = await prisma.account.create({
    data: { email: 'finance@perks.com', role: 'SUPER_ADMIN', profileType: 'ADMIN', status: 'ACTIVE' },
  });
  await prisma.adminUser.create({
    data: { accountId: financeAdminAccount.authUserId, firstName: 'Finance', lastName: 'Admin', role: 'FINANCE_ADMIN', isActive: true },
  });

  // ── Login Branding ─────────────────────────────────────
  await prisma.loginBranding.create({
    data: {
      appName: 'Employee Perks Platform',
      tagline: 'Exclusive perks for your team',
      heading: 'Welcome back',
      description: 'Sign in to access your employee perks and offers.',
      primaryColor: '#4F46E5',
      secondaryColor: '#818CF8',
      accentColor: '#F59E0B',
      textColor: '#111827',
      cardBackground: '#FFFFFF',
      layout: 'SPLIT_CARD',
      showLogo: true,
      showHeading: true,
      showDescription: true,
      showBanner: true,
      showFooter: true,
      footerTitle: 'Employee Perks Platform',
      footerDescription: 'Save more, every day.',
      copyright: `© ${new Date().getFullYear()} Employee Perks Platform. All rights reserved.`,
    },
  });

  // ── Theme ──────────────────────────────────────────────
  await prisma.theme.create({
    data: { name: 'Default', slug: 'default', isActive: true, settings: {} },
  });

  // ── Companies (Cyprus) ─────────────────────────────────
  // Emails/slugs UNCHANGED from prior seed so employee emails stay stable.
  const techCorp = await prisma.company.create({
    data: {
      name: 'TechCorp Inc.', slug: 'techcorp-inc', email: 'admin@techcorp.com',
      phone: '+357-25-100100', website: 'https://techcorp.com', employeeCount: 245, status: 'ACTIVE',
      addressLine1: '100 Spyrou Kyprianou Avenue', city: 'Limassol', state: 'Limassol', postalCode: '3036',
      country: 'Cyprus', industry: 'Technology', approvedDomain: 'techcorp.com', approvedAt: new Date('2025-06-01'),
    },
  });

  const globalSolutions = await prisma.company.create({
    data: {
      name: 'Global Solutions Ltd', slug: 'global-solutions-ltd', email: 'admin@globalsolutions.com',
      phone: '+357-22-200200', website: 'https://globalsolutions.com', employeeCount: 89, status: 'ACTIVE',
      industry: 'Consulting', approvedDomain: 'globalsolutions.com',
      addressLine1: '200 Archbishop Makarios III Avenue', city: 'Nicosia', state: 'Nicosia', postalCode: '1065',
      country: 'Cyprus', approvedAt: new Date('2025-08-15'),
    },
  });

  const innovateX = await prisma.company.create({
    data: {
      name: 'InnovateX', slug: 'innovatex', email: 'hello@innovatex.io',
      phone: '+357-24-300300', website: 'https://innovatex.io', employeeCount: 512, status: 'ACTIVE',
      industry: 'Technology', approvedDomain: 'innovatex.io',
      addressLine1: '50 Zinonos Kitieos Street', city: 'Larnaca', state: 'Larnaca', postalCode: '6023',
      country: 'Cyprus', approvedAt: new Date('2025-03-20'),
    },
  });

  const blueOcean = await prisma.company.create({
    data: {
      name: 'BlueOcean Corp', slug: 'blueocean-corp', email: 'contact@blueocean.com',
      phone: '+357-25-400400', employeeCount: 34, status: 'PAUSED', industry: 'Logistics',
      addressLine1: '10 Franklin Roosevelt Avenue', city: 'Limassol', state: 'Limassol', postalCode: '3045',
      country: 'Cyprus',
    },
  });

  const northStar = await prisma.company.create({
    data: {
      name: 'NorthStar Enterprises', slug: 'northstar-enterprises', email: 'admin@northstar.com',
      phone: '+357-25-500500', website: 'https://northstar.com', employeeCount: 178, status: 'ACTIVE',
      industry: 'Retail', approvedDomain: 'northstar.com',
      addressLine1: 'Feidiou 22', city: 'Limassol', state: 'Limassol', postalCode: '3075',
      country: 'Cyprus', approvedAt: new Date('2025-09-22'),
    },
  });

  // ── Company Billing ────────────────────────────────────
  await prisma.companyBilling.createMany({
    data: [
      { companyId: techCorp.id, plan: 'enterprise', billingEmail: 'billing@techcorp.com', pricePerEmployee: 8.0, currency: 'EUR', isTrial: false, billingStatus: 'ACTIVE', renewalDate: new Date('2027-01-01') },
      { companyId: globalSolutions.id, plan: 'growth', billingEmail: 'billing@globalsolutions.com', pricePerEmployee: 5.0, currency: 'EUR', isTrial: false, billingStatus: 'ACTIVE', renewalDate: new Date('2026-12-01') },
      { companyId: innovateX.id, plan: 'enterprise', billingEmail: 'billing@innovatex.io', pricePerEmployee: 8.0, currency: 'EUR', isTrial: false, billingStatus: 'INVOICE_OVERDUE', renewalDate: new Date('2026-06-15') },
      { companyId: northStar.id, plan: 'growth', billingEmail: 'billing@northstar.com', pricePerEmployee: 5.0, currency: 'EUR', isTrial: true, billingStatus: 'ACTIVE', trialEndsAt: new Date('2026-07-01'), renewalDate: new Date('2026-07-01') },
    ],
  });

  // ── Company Admins ─────────────────────────────────────
  const companyAdminInputs = [
    { companyId: techCorp.id, email: 'john@techcorp.com', firstName: 'John', lastName: 'Doe' },
    { companyId: globalSolutions.id, email: 'jane@globalsolutions.com', firstName: 'Jane', lastName: 'Smith' },
    { companyId: innovateX.id, email: 'bob@innovatex.io', firstName: 'Bob', lastName: 'Johnson' },
    { companyId: blueOcean.id, email: 'alice@blueocean.com', firstName: 'Alice', lastName: 'Williams' },
    { companyId: northStar.id, email: 'charlie@northstar.com', firstName: 'Charlie', lastName: 'Brown' },
  ];
  for (const ca of companyAdminInputs) {
    const acct = await prisma.account.create({
      data: { email: ca.email, role: 'COMPANY_ADMIN', profileType: 'COMPANY', status: 'ACTIVE' },
    });
    await prisma.companyAdmin.create({
      data: { companyId: ca.companyId, firstName: ca.firstName, lastName: ca.lastName, isPrimary: true, isActive: true, accountId: acct.authUserId },
    });
  }

  // ── Categories (global master data) ────────────────────
  const catNames = ['Food & Dining', 'Retail', 'Technology', 'Health & Fitness', 'Entertainment', 'Travel', 'Fashion', 'Shopping Malls', 'Family & Kids', 'Home Improvement', 'Toys & Games'];
  const catData = catNames.map((name, i) => ({
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    icon: ['utensils', 'shopping-bag', 'laptop', 'heart', 'film', 'plane', 'shirt', 'building', 'users', 'wrench', 'gamepad'][i],
    displayOrder: i,
  }));
  await prisma.category.createMany({ data: catData });
  const allCategories = await prisma.category.findMany();

  // ── Employees ──────────────────────────────────────────
  // Prefixes/company.slug UNCHANGED so employee emails stay identical.
  const companyEmployeeData = [
    { company: techCorp, prefix: 'techcorp', count: 12, statuses: ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE', 'ACTIVE', 'ACTIVE', 'INVITED', 'ACTIVE'] },
    { company: globalSolutions, prefix: 'globalsol', count: 6, statuses: ['ACTIVE', 'ACTIVE', 'INACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE'] },
    { company: innovateX, prefix: 'innovatex', count: 10, statuses: ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'INVITED', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE', 'ACTIVE'] },
    { company: northStar, prefix: 'northstar', count: 8, statuses: ['ACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE', 'ACTIVE'] },
  ];

  const firstNames = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack', 'Kate', 'Leo'];
  const lastNames = ['Johnson', 'Smith', 'Davis', 'Wilson', 'Martinez', 'Lee', 'Kim', 'Brown', 'Taylor', 'Anderson', 'Thomas', 'Clark'];
  const depts = ['Engineering', 'Marketing', 'Sales', 'Design', 'Finance', 'HR', 'Operations', 'Support'];
  const allEmployees: Awaited<ReturnType<typeof prisma.employee.create>>[] = [];

  for (const { company, prefix, count, statuses } of companyEmployeeData) {
    for (let i = 0; i < count; i++) {
      const email = `${prefix}.emp${i + 1}@${company.slug}.com`;
      const acct = await prisma.account.create({
        data: { email, role: 'EMPLOYEE', profileType: 'EMPLOYEE', status: statuses[i] === 'INVITED' ? 'PENDING' : 'ACTIVE' },
      });
      const emp = await prisma.employee.create({
        data: {
          companyId: company.id,
          accountId: acct.authUserId,
          firstName: firstNames[i % firstNames.length]!,
          lastName: lastNames[i % lastNames.length]!,
          employeeId: `EMP-${prefix.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
          department: depts[i % depts.length]!,
          status: statuses[i] as any,
          joinMethod: statuses[i] === 'INVITED' ? 'invite' : 'csv_import',
          invitedAt: statuses[i] === 'INVITED' ? new Date() : undefined,
          invitedBy: supportAdmin.id,
        },
      });
      allEmployees.push(emp);
    }
  }

  // ── Cyprus merchants (non-food + food + offers) ────────
  await seedLimassolMerchants(prisma);
  await seedLimassolFoodMerchants(prisma);
  await seedLimassolOffers(prisma);

  const allMerchants = await prisma.merchant.findMany();
  const activeMerchants = allMerchants.filter((m) => m.status === 'ACTIVE');
  const techCorpEmployees = allEmployees.filter((e) => e.companyId === techCorp.id);
  const firstMerchant = activeMerchants[0];

  // ── Issue Reports ──────────────────────────────────────
  if (firstMerchant && techCorpEmployees.length >= 3) {
    for (let i = 0; i < 3; i++) {
      const emp = techCorpEmployees[i]!;
      await prisma.issueReport.create({
        data: {
          merchantId: firstMerchant.id,
          employeeId: emp.id,
          title: ['Redemption not honored', 'Discount not applied', 'Wrong amount charged'][i]!,
          description: [
            'The merchant refused to honor the discount code at checkout.',
            'The discount was not applied even though I showed the offer.',
            'The amount charged was higher than expected by €10.',
          ][i]!,
          category: 'redemption',
          priority: i === 0 ? 'high' : 'normal',
          status: i === 0 ? 'OPEN' : 'UNDER_REVIEW',
          adminId: i === 1 ? superAdmin.id : undefined,
          adminNotes: i === 1 ? 'Contacting merchant for details.' : undefined,
        },
      });
    }
  }

  // ── Hero Banners ───────────────────────────────────────
  const activeMerchantIds = activeMerchants.map((m) => m.id);
  await prisma.heroBanner.createMany({
    data: [
      { title: 'Summer Sale', subtitle: 'Exclusive summer deals', headline: 'Save Big This Summer', subtext: 'Limited time offers from top merchants', discountBadge: '20% OFF', imageUrl: 'https://images.unsplash.com/hero-summer', linkUrl: '/offers/summer', linkText: 'Shop Now', isActive: true, displayOrder: 1, startDate: new Date('2026-06-01'), endDate: new Date('2026-08-31'), merchantId: activeMerchantIds[0] ?? null },
      { title: 'New Merchants', subtitle: 'Fresh additions to the platform', headline: 'Welcome Our New Partners', subtext: 'Discover exciting new offers', imageUrl: 'https://images.unsplash.com/hero-new', linkUrl: '/merchants/new', linkText: 'Explore', isActive: true, displayOrder: 2, startDate: new Date('2026-05-01'), merchantId: activeMerchantIds[1] ?? null },
      { title: 'Flash Deals', discountBadge: 'LIMITED', imageUrl: 'https://images.unsplash.com/hero-flash', isActive: false, displayOrder: 3 },
    ],
  });

  // ── Banner Slots (TOP / BOTTOM) ────────────────────────
  const topBanner = await prisma.banner.create({
    data: {
      name: 'Home Top Banner',
      description: 'Premium top-of-page banner slot',
      position: 'TOP',
      displayOrder: 1,
      pricePerDay: 100,
      minDays: 3,
      maxDays: 30,
      isActive: true,
      expiresAt: new Date('2026-12-31'),
    },
  });

  const bottomBanner = await prisma.banner.create({
    data: {
      name: 'Home Bottom Banner',
      description: 'Bottom-of-page banner slot',
      position: 'BOTTOM',
      displayOrder: 1,
      pricePerDay: 75,
      minDays: 3,
      maxDays: 30,
      isActive: true,
      expiresAt: new Date('2026-12-31'),
    },
  });

  // Sequential bookings for TOP (non-overlapping)
  if (activeMerchantIds.length >= 3) {
    const [m0, m1, m2] = activeMerchantIds;
    const topBookings = [
      { bannerId: topBanner.id, merchantId: m0!, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-05'), status: 'APPROVED' as const, paid: true },
      { bannerId: topBanner.id, merchantId: m1!, startDate: new Date('2026-09-06'), endDate: new Date('2026-09-10'), status: 'APPROVED' as const, paid: true },
      { bannerId: topBanner.id, merchantId: m2!, startDate: new Date('2026-09-11'), endDate: new Date('2026-09-15'), status: 'PENDING' as const, paid: false },
    ];
    for (const b of topBookings) {
      const booking = await prisma.bannerBooking.create({ data: b });
      await prisma.bannerContent.create({
        data: { bookingId: booking.id, imageUrl: `https://images.unsplash.com/banner-${b.merchantId.slice(0, 8)}`, altText: 'Banner image' },
      });
    }
  }

  // Sequential bookings for BOTTOM (non-overlapping)
  if (activeMerchantIds.length >= 2) {
    const [m0, m1] = activeMerchantIds;
    const bottomBookings = [
      { bannerId: bottomBanner.id, merchantId: m0!, startDate: new Date('2026-09-01'), endDate: new Date('2026-09-07'), status: 'APPROVED' as const, paid: true },
      { bannerId: bottomBanner.id, merchantId: m1!, startDate: new Date('2026-09-08'), endDate: new Date('2026-09-14'), status: 'APPROVED' as const, paid: true },
    ];
    for (const b of bottomBookings) {
      const booking = await prisma.bannerBooking.create({ data: b });
      await prisma.bannerContent.create({
        data: { bookingId: booking.id, imageUrl: `https://images.unsplash.com/banner-${b.merchantId.slice(0, 8)}`, altText: 'Banner image' },
      });
    }
  }

  // ── Notification Events ────────────────────────────────
  await prisma.notificationEvent.createMany({
    data: [
      { recipientType: 'admin', adminId: superAdmin.id, title: 'New merchant pending approval', body: 'A new merchant application is awaiting review.', channel: 'IN_APP', priority: 'HIGH' },
      { recipientType: 'admin', adminId: supportAdmin.id, title: 'Issue report assigned', body: 'An issue report has been assigned to you.', channel: 'IN_APP', priority: 'NORMAL' },
      { recipientType: 'admin', adminId: superAdmin.id, title: 'Bulk CSV import completed', body: 'TechCorp imported 245 employees successfully.', channel: 'IN_APP', priority: 'LOW' },
    ],
  });

  // ── Platform Settings ──────────────────────────────────
  await prisma.platformSettings.createMany({
    data: [
      { key: 'general_platform_name', value: '"Employee Perks Platform"' },
      { key: 'general_support_email', value: '"support@perks.com"' },
      { key: 'general_max_redemptions_per_month', value: '10' },
      { key: 'general_currency', value: '"EUR"' },
      { key: 'redemption_require_verification', value: 'true' },
      { key: 'notifications_admin_email', value: '"admin-alerts@perks.com"' },
      { key: 'csv_max_file_size_mb', value: '10' },
    ],
  });

  console.log('✅ Seed complete!');
  console.log('');
  console.log('📋 Test Accounts (password: Test@123456):');
  console.log('   Employee:      northstar.emp8@northstar-enterprises.com');
  console.log('   Merchants:     merchant@burgerking-limassol.com, merchant@mcdonalds-limassol.com, merchant@starbucks-limassol.com');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });