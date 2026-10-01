import { PrismaClient, MerchantStatus, MerchantOnboardingStep, BranchType, BranchStatus } from "@prisma/client";

const MERCHANT_ASSET_BASE_URL = process.env.MERCHANT_ASSET_BASE_URL ?? "https://assets.perksandmore.com";

type SeedMerchant = {
  businessName: string;
  slug: string;
  contactName: string;
  contactPhone: string;
  description: string;
  website?: string;
  categorySlug: string;
  tags: string[];
  branch: {
    name: string;
    addressLine1: string;
    city: string;
    country: string;
    postalCode: string;
    latitude: number;
    longitude: number;
    phone: string;
  };
};

// ── Non-food Limassol merchants ─────────────────────────
export const limassolMerchants: SeedMerchant[] = [
  {
    businessName: "Timinis Outlet",
    slug: "timinis-outlet-limassol",
    contactName: "Timinis Outlet Management",
    contactPhone: "+357 25 335066",
    description: "Fashion outlet on Makarios Avenue offering discounted clothing, shoes and accessories.",
    website: "https://www.timinis.com/",
    categorySlug: "fashion",
    tags: ["fashion", "outlet", "clothing"],
    branch: { name: "Timinis Outlet – Makarios Avenue", addressLine1: "Arch. Makarios III Avenue 125-127", city: "Limassol", country: "Cyprus", postalCode: "3021", latitude: 34.68553, longitude: 33.0328402, phone: "+357 25 335066" },
  },
  {
    businessName: "MY MALL Limassol",
    slug: "my-mall-limassol",
    contactName: "MY MALL Limassol Management",
    contactPhone: "+357 25 343777",
    description: "Large shopping mall with a wide mix of international and local fashion, dining and lifestyle stores.",
    website: "http://www.mymall.com.cy/",
    categorySlug: "shopping-malls",
    tags: ["mall", "shopping-center", "family"],
    branch: { name: "MY MALL Limassol", addressLine1: "285 Franklin Roosevelt", city: "Limassol", country: "Cyprus", postalCode: "3150", latitude: 34.6527985, longitude: 32.9971829, phone: "+357 25 343777" },
  },
  {
    businessName: "Hyper Fashion Boutique",
    slug: "hyper-fashion-boutique-limassol",
    contactName: "Hyper Fashion Boutique Management",
    contactPhone: "+357 25 738830",
    description: "Multi-brand fashion boutique carrying clothing, shoes and accessories.",
    website: "https://eshop.hypercy.com/",
    categorySlug: "fashion",
    tags: ["fashion", "boutique", "clothing"],
    branch: { name: "Hyper Fashion Boutique – Makarios Avenue", addressLine1: "Arch. Makarios III Avenue 137", city: "Limassol", country: "Cyprus", postalCode: "3021", latitude: 34.6863557, longitude: 33.0345639, phone: "+357 25 738830" },
  },
  {
    businessName: "Luxury Brands Outlet",
    slug: "luxury-brands-outlet",
    contactName: "Luxury Brands Outlet Management",
    contactPhone: "+357 25 349988",
    description: "Outlet specializing in discounted luxury clothing, shoes and leather goods.",
    website: "https://luxurybrandscy.com/",
    categorySlug: "fashion",
    tags: ["fashion", "luxury", "outlet"],
    branch: { name: "Luxury Brands Outlet – Spyrou Kyprianou", addressLine1: "Spyrou Kyprianou Ave 60", city: "Limassol", country: "Cyprus", postalCode: "4154", latitude: 34.6816855, longitude: 33.0118312, phone: "+357 25 349988" },
  },
  {
    businessName: "Little Family Project",
    slug: "little-family-project",
    contactName: "Little Family Project Management",
    contactPhone: "+357 25 252581",
    description: "Curated kids' clothing, toys, and home goods for the whole family.",
    website: "https://www.littlefamilyproject.com/",
    categorySlug: "family-kids",
    tags: ["kids", "family", "clothing", "toys"],
    branch: { name: "Little Family Project – Gladstonos", addressLine1: "Gladstonos 82", city: "Limassol", country: "Cyprus", postalCode: "3040", latitude: 34.6808498, longitude: 33.0443255, phone: "+357 25 252581" },
  },
  {
    businessName: "Mangas Home Improvement",
    slug: "mangas-home-improvement",
    contactName: "Mangas Home Improvement Management",
    contactPhone: "+357 25 828000",
    description: "Home improvement, DIY, garden and sporting goods store.",
    website: "http://www.mangas.com.cy/",
    categorySlug: "home-improvement",
    tags: ["home-improvement", "diy", "garden"],
    branch: { name: "Mangas Home Improvement – Agios Athanasios", addressLine1: "Andrea Kariolou, Agios Athanasios", city: "Limassol", country: "Cyprus", postalCode: "4102", latitude: 34.7029238, longitude: 33.0657137, phone: "+357 25 828000" },
  },
  {
    businessName: "Mitsingas Wonderland",
    slug: "mitsingas-wonderland",
    contactName: "Mitsingas Wonderland Management",
    contactPhone: "+357 25 820888",
    description: "Toy store with a wide selection of board games, LEGO, action figures and puzzles.",
    website: "https://www.mitsingaswonderlandtoys.com/",
    categorySlug: "toys-games",
    tags: ["toys", "games", "lego"],
    branch: { name: "Mitsingas Wonderland – Makarios Avenue", addressLine1: "Arch. Makarios III Avenue 185", city: "Limassol", country: "Cyprus", postalCode: "3030", latitude: 34.6876813, longitude: 33.0469878, phone: "+357 25 820888" },
  },
  {
    businessName: "Limassol Shopping Center",
    slug: "limassol-shopping-center",
    contactName: "Limassol Shopping Center Management",
    contactPhone: "+357 96 323212",
    description: "Shopping center anchored by IKEA and a large supermarket, plus sports, jewelry and coffee shops.",
    categorySlug: "shopping-malls",
    tags: ["mall", "shopping-center", "ikea"],
    branch: { name: "Limassol Shopping Center – Kato Polemidia", addressLine1: "Theodorou Potamianou 42, Kato Polemidia", city: "Limassol", country: "Cyprus", postalCode: "4154", latitude: 34.6880747, longitude: 33.0107852, phone: "+357 96 323212" },
  },
  {
    businessName: "Limassol Shopping Centre",
    slug: "limassol-shopping-centre-katsantonaion",
    contactName: "Limassol Shopping Centre Management",
    contactPhone: "+357 25 333375",
    description: "Shopping centre with AlphaMega supermarket, Jumbo, IKEA and Sport Direct.",
    categorySlug: "shopping-malls",
    tags: ["mall", "shopping-center", "supermarket"],
    branch: { name: "Limassol Shopping Centre – Katsantonaion", addressLine1: "Katsantonaion 20", city: "Limassol", country: "Cyprus", postalCode: "4154", latitude: 34.6874191, longitude: 33.0101126, phone: "+357 25 333375" },
  },
];

export async function seedLimassolMerchants(prisma: PrismaClient) {
  for (const m of limassolMerchants) {
    const category = await prisma.category.findUnique({ where: { slug: m.categorySlug } });

    const merchant = await prisma.merchant.upsert({
      where: { slug: m.slug },
      update: {},
      create: {
        businessName: m.businessName,
        slug: m.slug,
        contactName: m.contactName,
        contactPhone: m.contactPhone,
        description: m.description,
        website: m.website,
        logoUrl: `${MERCHANT_ASSET_BASE_URL}/logos/${m.slug}.png`,
        coverImageUrl: `${MERCHANT_ASSET_BASE_URL}/covers/${m.slug}.png`,
        categoryId: category?.id,
        status: MerchantStatus.ACTIVE,
        onboardingStep: MerchantOnboardingStep.COMPLETE,
        addressLine1: m.branch.addressLine1,
        city: m.branch.city,
        country: m.branch.country,
        postalCode: m.branch.postalCode,
        tags: m.tags,
        approvedAt: new Date(),
        liveAt: new Date(),
      },
    });

    const existingBranch = await prisma.merchantBranch.findFirst({
      where: { merchantId: merchant.id, isPrimary: true },
    });
    if (!existingBranch) {
      await prisma.merchantBranch.create({
        data: {
          merchantId: merchant.id,
          name: m.branch.name,
          addressLine1: m.branch.addressLine1,
          city: m.branch.city,
          country: m.branch.country,
          postalCode: m.branch.postalCode,
          phone: m.branch.phone,
          latitude: m.branch.latitude,
          longitude: m.branch.longitude,
          branchType: BranchType.IN_STORE,
          status: BranchStatus.ACTIVE,
          isPrimary: true,
          isActive: true,
        },
      });
    }
    console.log(`Seeded merchant: ${merchant.businessName} (${merchant.slug})`);
  }
}

// ── Fast-food merchants (with login accounts) ───────────
// ⚠️ VERIFY: if Burger King/McDonald's/Starbucks already exist in your DB
// under different slugs or emails (from manual edits), replace the slug/
// email values below with the REAL ones before running, or this will
// create duplicate merchant rows instead of matching the existing ones.
type SeedFoodMerchant = Omit<SeedMerchant, 'categorySlug'> & {
  email: string;
  categorySlug: string;
};

export const limassolFoodMerchants: SeedFoodMerchant[] = [
  {
    businessName: "Burger King",
    slug: "burger-king-limassol", // ⚠️ verify against real DB slug
    email: "merchant@burgerking-limassol.com", // ⚠️ verify against real DB email
    contactName: "Burger King Limassol Management",
    contactPhone: "+357 25 111111",
    description: "Classic burgers, fries and shakes on Makarios Avenue.",
    categorySlug: "food-dining",
    tags: ["fast-food", "burgers"],
    branch: { name: "Burger King – Spyrou Kyprianou Avenue", addressLine1: "Spyrou Kyprianou Avenue 74", city: "Limassol", country: "Cyprus", postalCode: "4003", latitude: 34.6789731, longitude: 33.0453172, phone: "+357 25 111111" },
  },
  {
    businessName: "McDonald's",
    slug: "mcdonalds-limassol",
    email: "merchant@mcdonalds-limassol.com",
    contactName: "McDonald's Limassol Management",
    contactPhone: "+357 25 222222",
    description: "Burgers, fries, and breakfast all day.",
    categorySlug: "food-dining",
    tags: ["fast-food"],
    branch: { name: "McDonald's – Makarios Avenue", addressLine1: "161 Arch. Makarios III Avenue", city: "Limassol", country: "Cyprus", postalCode: "4190", latitude: 34.6779, longitude: 33.0332, phone: "+357 25 222222" },
  },
  {
    businessName: "Starbucks",
    slug: "starbucks-limassol",
    email: "merchant@starbucks-limassol.com",
    contactName: "Starbucks Limassol Management",
    contactPhone: "+357 25 333333",
    description: "Coffee, pastries, and a place to relax.",
    categorySlug: "food-dining",
    tags: ["coffee"],
    branch: { name: "Starbucks – Enaerios", addressLine1: "241 Makariou III Avenue, Enaerios", city: "Limassol", country: "Cyprus", postalCode: "3060", latitude: 34.6748, longitude: 33.0245, phone: "+357 25 333333" },
  },
];

export async function seedLimassolFoodMerchants(prisma: PrismaClient) {
  const foodCategory = await prisma.category.findUnique({ where: { slug: "food-dining" } });

  for (const m of limassolFoodMerchants) {
    const acct = await prisma.account.upsert({
      where: { email: m.email },
      update: {},
      create: { email: m.email, role: "MERCHANT", profileType: "MERCHANT", status: "ACTIVE" },
    });

    const merchant = await prisma.merchant.upsert({
      where: { slug: m.slug },
      update: {},
      create: {
        accountId: acct.authUserId,
        businessName: m.businessName,
        slug: m.slug,
        contactName: m.contactName,
        contactPhone: m.contactPhone,
        description: m.description,
        logoUrl: `${MERCHANT_ASSET_BASE_URL}/logos/${m.slug}.png`,
        coverImageUrl: `${MERCHANT_ASSET_BASE_URL}/covers/${m.slug}.png`,
        categoryId: foodCategory?.id,
        status: MerchantStatus.ACTIVE,
        onboardingStep: MerchantOnboardingStep.COMPLETE,
        addressLine1: m.branch.addressLine1,
        city: m.branch.city,
        country: m.branch.country,
        postalCode: m.branch.postalCode,
        tags: m.tags,
        approvedAt: new Date(),
        liveAt: new Date(),
      },
    });

    const existingBranch = await prisma.merchantBranch.findFirst({
      where: { merchantId: merchant.id, isPrimary: true },
    });
    if (!existingBranch) {
      await prisma.merchantBranch.create({
        data: {
          merchantId: merchant.id,
          name: m.branch.name,
          addressLine1: m.branch.addressLine1,
          city: m.branch.city,
          country: m.branch.country,
          postalCode: m.branch.postalCode,
          phone: m.branch.phone,
          latitude: m.branch.latitude,
          longitude: m.branch.longitude,
          branchType: BranchType.IN_STORE,
          status: BranchStatus.ACTIVE,
          isPrimary: true,
          isActive: true,
        },
      });
    }
    console.log(`Seeded food merchant: ${merchant.businessName} (${merchant.slug})`);
  }
}

// ── Offers: one per redemption type ─────────────────────
// ── Offers: three per merchant (9 total), covering all redemption types ──
export async function seedLimassolOffers(prisma: PrismaClient) {
  const bk = await prisma.merchant.findUnique({ where: { slug: "burger-king-limassol" } });
  const mcd = await prisma.merchant.findUnique({ where: { slug: "mcdonalds-limassol" } });
  const sbux = await prisma.merchant.findUnique({ where: { slug: "starbucks-limassol" } });
  const foodCategory = await prisma.category.findUnique({ where: { slug: "food-dining" } });

  const now = new Date();
  const end = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 60); // +60 days

  const offerDefs = [
    // ── Burger King ──────────────────────────────────────
    {
      merchant: bk,
      title: "25% Off Double Burgers",
      offerType: "PERCENTAGE",
      redemptionType: "ONLINE_CODE",
      isFeatured: true,
      isExclusive: false,
      pricing: { percent: 25 },
      redemption: {
        code: "BK25CY",
        instructions: "Enter this code at checkout on the Burger King app.",
      },
      content: {
        shortDescription: "Get 25% off any Double Burger, redeemable online.",
        description:
          "Enjoy 25% off any Double Burger when you order through the Burger King app or website. Discount applies automatically at checkout when the code is entered. Valid for a single use per employee.",
        termsAndConditions:
          "Valid for online orders only. Cannot be combined with other offers. One redemption per employee. Excludes delivery fees. Offer valid at participating Burger King Cyprus locations.",
        imageUrls: [],
      },
    },
    {
      merchant: bk,
      title: "Free Onion Rings with Any Meal",
      offerType: "FLAT",
      redemptionType: "IN_STORE_QR",
      isFeatured: false,
      isExclusive: false,
      pricing: { amount: 3 },
      redemption: {
        instructions: "Show your redemption code to staff at checkout.",
      },
      content: {
        shortDescription: "Free portion of onion rings with any meal purchase, in-store.",
        description:
          "Order any meal and receive a free regular portion of onion rings. Redeemable in-store by presenting your unique code to staff at the till. Confirmed instantly once redeemed.",
        termsAndConditions:
          "Valid in-store only. One redemption per employee per visit. Meal purchase required. Cannot be combined with other in-store promotions.",
        imageUrls: [],
      },
    },
    {
      merchant: bk,
      title: "Reserve a Table for the Kids' Birthday Package",
      offerType: "FLAT",
      redemptionType: "BOOKING_LINK",
      isFeatured: false,
      isExclusive: true,
      pricing: { amount: 10 },
      redemption: {
        bookingUrl: "https://www.burgerking.in/",
        instructions: "Book your slot online using the link provided after redemption.",
      },
      content: {
        shortDescription: "€10 off the Burger King kids' birthday party package.",
        description:
          "Book the Burger King kids' birthday party package online and save €10 off the standard price. Complete your booking using the link provided after redeeming — a confirmation will follow by email.",
        termsAndConditions:
          "Advance booking required, subject to availability. Valid for one booking per employee. Cannot be redeemed for cash. Party package terms apply per venue.",
        imageUrls: [],
      },
    },

    // ── McDonald's ───────────────────────────────────────
    {
      merchant: mcd,
      title: "Buy 1 Get 1 Free Fries",
      offerType: "BUY_X_GET_Y",
      redemptionType: "IN_STORE_QR",
      isFeatured: false,
      isExclusive: true,
      pricing: {},
      redemption: {
        instructions: "Show your redemption code to staff at checkout.",
      },
      content: {
        shortDescription: "Buy any large fries, get a second one free — in-store only.",
        description:
          "Purchase one large portion of fries and receive a second one absolutely free. Redeemable in-store by presenting your unique code to staff at the till. Confirmed instantly once redeemed.",
        termsAndConditions:
          "Valid in-store only, not available for delivery or drive-thru online orders. One redemption per employee per visit. Free item must be of equal or lesser value.",
        imageUrls: [],
      },
    },
    {
      merchant: mcd,
      title: "15% Off Your Next Online Order",
      offerType: "PERCENTAGE",
      redemptionType: "ONLINE_CODE",
      isFeatured: false,
      isExclusive: false,
      pricing: { percent: 15 },
      redemption: {
        code: "MCD15CY",
        instructions: "Enter this code at checkout on the McDonald's app.",
      },
      content: {
        shortDescription: "15% off your next order placed through the McDonald's app.",
        description:
          "Save 15% on your next order when you check out through the McDonald's app. Discount applies automatically once the code is entered at checkout.",
        termsAndConditions:
          "Valid for app orders only. One redemption per employee. Cannot be combined with other offers. Minimum order value may apply per app terms.",
        imageUrls: [],
      },
    },
    {
      merchant: mcd,
      title: "Book a McCafé Tasting Session",
      offerType: "FLAT",
      redemptionType: "BOOKING_LINK",
      isFeatured: false,
      isExclusive: false,
      pricing: { amount: 4 },
      redemption: {
        bookingUrl: "https://www.mcdonalds.com/",
        instructions: "Book your slot online using the link provided after redemption.",
      },
      content: {
        shortDescription: "€4 off a McCafé coffee tasting session, booked online.",
        description:
          "Book a McCafé coffee tasting session and save €4 off the standard price. Complete your booking using the link provided after redeeming — your slot will be confirmed by email.",
        termsAndConditions:
          "Advance booking required, subject to availability. Valid for one session per employee. Cannot be redeemed for cash.",
        imageUrls: [],
      },
    },

    // ── Starbucks ────────────────────────────────────────
    {
      merchant: sbux,
      title: "€5 Off a Reserve Tasting Experience",
      offerType: "FLAT",
      redemptionType: "BOOKING_LINK",
      isFeatured: false,
      isExclusive: false,
      pricing: { amount: 5 },
      redemption: {
        bookingUrl: "https://www.starbucks.com/reserve/booking",
        instructions: "Book your slot online using the link provided after redemption.",
      },
      content: {
        shortDescription: "€5 off a guided Reserve coffee tasting experience.",
        description:
          "Book a guided tasting experience at the Starbucks Reserve counter and enjoy €5 off the standard price. Complete your booking online after redeeming this offer — your reserved slot will be confirmed by email.",
        termsAndConditions:
          "Advance booking required. Subject to availability. Valid for one tasting session per employee. Cannot be redeemed for cash.",
        imageUrls: [],
      },
    },
    {
      merchant: sbux,
      title: "Free Size Upgrade on Any Drink",
      offerType: "FLAT",
      redemptionType: "IN_STORE_QR",
      isFeatured: true,
      isExclusive: false,
      pricing: { amount: 1 },
      redemption: {
        instructions: "Show your redemption code to staff at checkout.",
      },
      content: {
        shortDescription: "Free upgrade to the next size on any handcrafted drink, in-store.",
        description:
          "Order any handcrafted beverage and get a free upgrade to the next size up. Redeemable in-store by showing your unique code to staff at the till.",
        termsAndConditions:
          "Valid in-store only. One redemption per employee per visit. Applies to hot and cold handcrafted beverages only; excludes bottled drinks.",
        imageUrls: [],
      },
    },
    {
      merchant: sbux,
      title: "20% Off Online Merchandise Orders",
      offerType: "PERCENTAGE",
      redemptionType: "ONLINE_CODE",
      isFeatured: false,
      isExclusive: false,
      pricing: { percent: 20 },
      redemption: {
        code: "SBUX20CY",
        instructions: "Enter this code at checkout on the Starbucks online store.",
      },
      content: {
        shortDescription: "20% off tumblers, mugs, and merchandise ordered online.",
        description:
          "Save 20% on tumblers, mugs, and other Starbucks merchandise when ordering through the online store. Discount applies automatically once the code is entered at checkout.",
        termsAndConditions:
          "Valid for online merchandise orders only, excludes food and beverages. One redemption per employee. Cannot be combined with other offers.",
        imageUrls: [],
      },
    },
  ];

  for (const def of offerDefs) {
    if (!def.merchant) {
      console.log(`Skipped offer "${def.title}" — merchant not found`);
      continue;
    }

    const offer = await prisma.merchantOffer.create({
      data: {
        merchantId: def.merchant.id,
        categoryId: foodCategory?.id,
        title: def.title,
        offerType: def.offerType,
        status: "LIVE",
        startDate: now,
        endDate: end,
        submittedAt: now,
        reviewedAt: now,
        liveAt: now,
        isFeatured: def.isFeatured,
        isExclusive: def.isExclusive,
      },
    });

    await prisma.offerPricing.create({
      data: {
        offerId: offer.id,
        pricingType: def.offerType,
        configuration: def.pricing,
      },
    });

    await prisma.offerRedemption.create({
      data: {
        offerId: offer.id,
        redemptionType: def.redemptionType,
        configuration: def.redemption,
        maxRedemptions: 20,
      },
    });

    await prisma.offerContent.create({
      data: {
        offerId: offer.id,
        shortDescription: def.content.shortDescription,
        description: def.content.description,
        termsAndConditions: def.content.termsAndConditions,
        imageUrls: def.content.imageUrls,
      },
    });

    console.log(`Seeded offer: ${def.title} (${def.redemptionType})`);
  }
}