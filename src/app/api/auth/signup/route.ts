import { clientIpFromRequest } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAdminClient } from '@/lib/supabase/admin';
import { toE164 } from '@/lib/phone';
import { cleanSocialLinks } from '@/lib/social-links';
import { getPasswordError } from '@/lib/validation/credentials';
import { validateUserEmail } from '@/services/user-validation.service';
import { normalizeEmail, rollbackAuthUser } from '@/services/employee-invite.service';
import { selectableCategoryWhere } from '@/lib/categories';

// Public self sign-up from the login page, merchants only. Merchants created
// here are live immediately: no approval queue item, ACTIVE account + profile.

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

const optStr = (max: number) => z.string().trim().max(max).optional().nullable();
const optUrl = (max: number) => z.string().trim().url().max(max).optional().nullable().or(z.literal(''));

const common = {
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  website: optUrl(300),
  socialLinks: z.object({
    instagram: optUrl(500),
    facebook: optUrl(500),
    twitter: optUrl(500),
    tiktok: optUrl(500),
  }).optional().nullable(),
  addressLine1: optStr(300),
  addressLine2: optStr(300),
  city: optStr(120),
  state: optStr(120),
  postalCode: optStr(20),
  country: optStr(120),
};

// Merchant only. Companies are created by platform admins and their admins
// get the invite email (single-use 72h set-password link).
const signupSchema = z.object({
  type: z.literal('MERCHANT'),
  businessName: z.string().trim().min(2).max(200),
  contactName: z.string().trim().min(1).max(200),
  contactPhone: optStr(30),
  categoryId: optStr(64),
  description: optStr(2000),
  ...common,
});

function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();

export async function POST(request: NextRequest) {
  const ip =
    clientIpFromRequest(request);
  if (!checkRateLimit(ip)) {
    return fail(429, 'RATE_LIMITED', 'Too many sign-up attempts. Please try again later.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'VALIDATION', 'Invalid request body');
  }
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, 'VALIDATION', 'Please check the highlighted fields.', parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;
  const email = normalizeEmail(data.email);

  const passwordError = getPasswordError(data.password);
  if (passwordError) return fail(400, 'VALIDATION', passwordError, { password: [passwordError] });

  const rawPhone = data.contactPhone;
  const phone = toE164(rawPhone);
  if (rawPhone && !phone) return fail(400, 'VALIDATION', 'Invalid phone number', { phone: ['Invalid phone number'] });

  if (data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, ...selectableCategoryWhere },
    });
    if (!category) return fail(400, 'INVALID_CATEGORY', 'Selected category does not exist.');
  }

  const existing = await validateUserEmail(email);
  if (existing.exists) {
    return fail(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists.', { email: ['Already registered'] });
  }

  const role = 'MERCHANT';
  const { data: created, error: authError } = await getAdminClient().auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: true,
    user_metadata: { role },
  });
  if (authError || !created?.user) {
    const msg = authError?.message ?? 'Could not create account';
    const isDup = /already|registered|exists/i.test(msg);
    return fail(isDup ? 409 : 502, isDup ? 'EMAIL_ALREADY_EXISTS' : 'SIGNUP_FAILED', isDup ? 'An account with this email already exists.' : msg);
  }
  const userId = created.user.id;
  const now = new Date();
  const address = {
    addressLine1: data.addressLine1 || null,
    addressLine2: data.addressLine2 || null,
    city: data.city || null,
    state: data.state || null,
    postalCode: data.postalCode || null,
    country: data.country || null,
  };
  const socialLinks = (cleanSocialLinks(data.socialLinks) ?? undefined) as any;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.account.create({
        data: { authUserId: userId, email, role: 'MERCHANT', profileType: 'MERCHANT', status: 'ACTIVE' },
      });
      await tx.merchant.create({
        data: {
          id: userId,
          accountId: userId,
          businessName: data.businessName,
          slug: slugify(data.businessName),
          contactName: data.contactName,
          contactPhone: phone,
          categoryId: data.categoryId || null,
          description: data.description || null,
          website: data.website || null,
          socialLinks,
          ...address,
          status: 'ACTIVE',
          onboardingStep: 'COMPLETE',
          approvedAt: now,
        },
      });
    });
  } catch (error: any) {
    await rollbackAuthUser(userId);
    if (error?.code === 'P2002') {
      return fail(409, 'CONFLICT', 'An account with these details already exists.');
    }
    console.error('Sign-up error:', error);
    return fail(500, 'INTERNAL', 'Internal server error');
  }

  return NextResponse.json({ success: true, data: { role } }, { status: 201 });
}
