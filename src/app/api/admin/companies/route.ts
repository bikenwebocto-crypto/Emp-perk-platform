import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { createAuditLog, buildAuditData, fromCurrentUser } from '@/services/audit-log.service';
import { sendCompanyAdminInvitation } from '@/services/company-admin-invitation.service';
import { getCurrentUser } from '@/lib/supabase/server';
import { adminCompanyActionSchema } from '@/schemas';
import { validateUserEmail } from '@/services/user-validation.service';
import { getCityReadiness } from '@/lib/company-activation/city-readiness';
import { sendLaunchPack } from '@/lib/company-activation/launch-pack';
import { derivePrimaryAdmin, summarizeAdmins } from '@/lib/company-contact';
import { createPerfTimer } from '@/lib/perf';
import type { CompanyStatus } from '@/types';
import { BUSINESS_NOTIFICATION_TEMPLATES, channels, publishBusinessToAdmins, publishBusinessToCompanyAdmins } from '@/services/business-notification.service';
import { z } from 'zod';

const submissionAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_ATTEMPTS = 3; // per IP per window, unauthenticated only

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = submissionAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    submissionAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

const companySignupSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(254),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).optional().nullable(),
  website: z.string().trim().url().max(300).optional().nullable().or(z.literal('')),
  employeeCount: z.number().int().min(0).max(1_000_000).optional().nullable(),
  addressLine1: z.string().trim().max(300).optional().nullable(),
  addressLine2: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  taxId: z.string().trim().max(60).optional().nullable(),
});


function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 },
  );
}

function notFound(entity: string) {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: `${entity} not found` } },
    { status: 404 },
  );
}

function internalError(error: unknown) {
  console.error('Companies API error:', error);
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 },
  );
}

// GET /api/admin/companies — list all companies
//
// Query params:
//   - status      : company status (ALL | PENDING | ACTIVE | PAUSED | SUSPENDED | CANCELLED | APPROVED_PENDING_PAYMENT)
//   - adminStatus : filter to companies whose primary admin is ACTIVE/INACTIVE
//   - page, pageSize
//   - q           : free-text search across company name, company contact email, and admin email
export async function GET(request: NextRequest) {
  const timer = createPerfTimer('GET /api/admin/companies')
  timer.section('Authentication')
  try {
    const user = await getCurrentUser(timer);
    timer.point('user auth check')
    if (!user) return unauthorized();
    if (user.userType !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const adminStatus = searchParams.get('adminStatus');
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20')));
    const q = searchParams.get('q');

    const where: Record<string, unknown> = { deletedAt: null };
    if (status && status !== 'ALL') where.status = status as CompanyStatus;

    timer.section('Filter Resolution')
    if (adminStatus === 'ACTIVE' || adminStatus === 'INACTIVE') {
      timer.point('companyAdmin.findMany (adminStatus filter)')
      const isActive = adminStatus === 'ACTIVE'
      const matchingAdmins = await prisma.companyAdmin.findMany({
        where: { isActive },
        select: { companyId: true },
        distinct: ['companyId'],
      })
      where.id = { in: matchingAdmins.map((a) => a.companyId) }
    }

    if (q && q.trim()) {
      timer.point('account.findMany + companyAdmin.findMany (q search)')
      const term = q.trim()
      const matchingAccounts = await prisma.account.findMany({
        where: { email: { contains: term, mode: 'insensitive' }, profileType: 'COMPANY' },
        select: { authUserId: true },
      })
      const matchingAdminIds = matchingAccounts.map((a) => a.authUserId).filter(Boolean)
      const matchingAdmins = await prisma.companyAdmin.findMany({
        where: { id: { in: matchingAdminIds } },
        select: { companyId: true },
        distinct: ['companyId'],
      })
      const adminEmailCompanyIds = matchingAdmins.map((a) => a.companyId)

      const orClauses: Record<string, unknown>[] = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ]
      if (adminEmailCompanyIds.length > 0) {
        orClauses.push({ id: { in: adminEmailCompanyIds } })
      }

      const existingIdIn = (where.id as { in?: string[] } | undefined)?.in
      if (existingIdIn) {
        const intersected = adminEmailCompanyIds.length > 0
          ? adminEmailCompanyIds.filter((id) => existingIdIn.includes(id))
          : existingIdIn
        where.id = { in: intersected }
        delete (where as any).OR
        where.AND = [{ OR: orClauses }]
      } else {
        where.OR = orClauses
      }
    }

    timer.section('Database Queries')
    timer.point('company.findMany + company.count')
    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { employees: true, redemptions: true, csvUploads: true } },
          billing: { select: { plan: true, isTrial: true, trialEndsAt: true, billingStatus: true, renewalDate: true } },
          companyAdmins: { orderBy: { createdAt: 'asc' } },
        },
      }),
      prisma.company.count({ where: where as any }),
    ]);

    timer.point('data mapping (summarizeAdmins, derivePrimaryAdmin)')
    const data = companies.map((c) => {
      const admins = summarizeAdmins(c.companyAdmins)
      const activeAdmins = admins.filter((a) => a.isActive)
      const primaryAdmin = derivePrimaryAdmin(c.companyAdmins)
      return {
        id: c.id, name: c.name, email: c.email, phone: c.phone, website: c.website,
        city: c.city, country: c.country, industry: c.industry, logoUrl: c.logoUrl,
        status: c.status, employeeCount: c._count?.employees ?? 0,
        activeRedemptions: c._count?.redemptions ?? 0, joinedAt: c.createdAt, createdAt: c.createdAt,
        billing: c.billing,
        companyContact: {
          id: c.id, companyName: c.name, companyEmail: c.email, phone: c.phone, website: c.website,
          status: c.status, city: c.city, country: c.country, industry: c.industry,
          logoUrl: c.logoUrl, employeeCount: c._count?.employees ?? 0, createdAt: c.createdAt,
        },
        primaryAdmin, admins, adminCount: admins.length, activeAdminCount: activeAdmins.length,
      }
    })

    timer.section('Serialization')
    timer.point('NextResponse.json')
    timer.end()
    return NextResponse.json({
      success: true, data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), hasNextPage: page * pageSize < total, hasPreviousPage: page > 1 },
    });
  } catch (error) {
    timer.end()
    return internalError(error);
  }
}

// POST /api/admin/companies — create a new company
export async function POST(request: NextRequest) {
  const timer = createPerfTimer('POST /api/admin/companies')
  timer.section('Authentication')
  try {
    const user = await getCurrentUser(timer);
    const requiresApproval = !user || user.role !== 'SUPER_ADMIN'
    timer.point('user auth check')

    // Rate limit only applies to unauthenticated (public signup) submissions —
    // Super Admins are trusted, already-authenticated actors.
    if (!user) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.headers.get('x-real-ip') ??
        'unknown';
      if (!checkRateLimit(ip)) {
        return NextResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'Too many submissions. Please try again later.' } },
          { status: 429 },
        );
      }
    }

    timer.section('Validation')
    timer.point('schema validation')
    const rawBody = await request.json();
    const parsed = companySignupSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'Validation failed', details: parsed.error.flatten().fieldErrors } },
        { status: 400 },
      );
    }
    const { name, email, firstName, lastName, phone, website, employeeCount, addressLine1, addressLine2, city, state, postalCode, country, taxId } = parsed.data;

    timer.point('validateUserEmail')
    const validation = await validateUserEmail(email);
    if (validation.exists) {
      return NextResponse.json(
        { success: false, error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Email is already assigned to another account' } },
        { status: 409 },
      );
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();

    timer.section('Database Queries')
    timer.point('$transaction (company + account + companyAdmin + billing + audit)')
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name, slug, email, employeeCount: employeeCount ?? 0, phone, website,
          addressLine1, addressLine2, city, state, postalCode, country, taxId,
          status: requiresApproval ? 'PENDING' : 'APPROVED_PENDING_PAYMENT',
          approvedAt: requiresApproval ? null : new Date(),
        },
      });

      const pkId = crypto.randomUUID();
      await tx.account.create({
        data: { authUserId: pkId, email, role: 'COMPANY_ADMIN', profileType: 'COMPANY', status: 'ACTIVE' },
      });

      await tx.companyAdmin.create({
        data: { id: pkId, companyId: company.id, accountId: pkId, firstName, lastName, isPrimary: true, isActive: true },
      });

      await tx.companyBilling.create({
        data: { companyId: company.id, plan: 'growth', pricePerEmployee: 5.0, isTrial: true, trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      });

     

      if (requiresApproval) {
        await tx.actionQueueItem.create({
          data: {
            type: 'COMPANY_ACTIVATION',
            title: `New company activation: ${company.name}`,
            description: `Company ${company.name} is awaiting board activation approval.`,
            referenceId: company.id,
            referenceType: 'company',
            status: 'PENDING',
            priority: 2,
            metadata: { queueType: 'COMPANY_ACTIVATION', source: user ? 'ADMIN' : 'PUBLIC_SIGNUP' },
          },
        });
      }

      return company;
    });

    if (requiresApproval) {
      await publishBusinessToAdmins({
        type: 'SYSTEM',
        title: `New company activation: ${result.name}`,
        message: 'A company activation is waiting for board approval.',
        priority: 'HIGH',
        channels: channels('IN_APP', 'PUSH'),
        referenceType: 'company',
        referenceId: result.id,
        metadata: { companyId: result.id },
      });
    }

    timer.point('sendCompanyAdminInvitation')
    await sendCompanyAdminInvitation({
      email, firstName, lastName, companyName: name, companyId: result.id,
      actorType: user?.userType ?? 'PUBLIC',
      actorId: user?.profileId ?? null,
    })

    timer.section('Serialization')
    timer.point('NextResponse.json')
    timer.end()
    return NextResponse.json(
      { success: true, data: result, message: 'Company created successfully. A welcome email has been sent to the Company Administrator.' },
      { status: 201 },
    );
  } catch (error: any) {
    timer.end()
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'A company with this email or slug already exists' } },
        { status: 409 },
      );
    }
    return internalError(error);
  }
}

// PATCH /api/admin/companies — update company status
export async function PATCH(request: NextRequest) {
  const timer = createPerfTimer('PATCH /api/admin/companies')
  timer.section('Authentication')
  try {
    const user = await getCurrentUser(timer);
    timer.point('user auth check')
    if (!user || user.userType !== 'admin') return unauthorized();

    const body = await request.json();
    const parsed = adminCompanyActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'Validation failed', details: parsed.error.flatten().fieldErrors } },
        { status: 400 },
      );
    }

    const { companyId, status, reason, adminNote } = parsed.data;

    timer.section('Database Queries')
    timer.point('company.findUnique')
    const existing = await prisma.company.findUnique({ where: { id: companyId } });
    if (!existing || existing.deletedAt) return notFound('Company');
    const previousStatus = existing.status;

    if (status === 'ACTIVE') {
      timer.point('getCityReadiness')
      const readiness = await getCityReadiness(existing.city)
      if (!readiness.ready) {
        return NextResponse.json(
          { success: false, error: { code: 'CITY_NOT_READY', message: readiness.message, details: readiness } },
          { status: 422 }
        )
      }
    }

    timer.point('company.update')
    const company = await prisma.company.update({
      where: { id: companyId },
      data: {
        status: status as any,
        adminNote: adminNote ?? existing.adminNote,
        approvedAt: status === 'ACTIVE' && !existing.approvedAt ? new Date() : undefined,
      },
    });

    timer.point('companyStatusHistory.create')
    await prisma.companyStatusHistory.create({
      data: { companyId, fromStatus: previousStatus, toStatus: status as any, changedBy: user.id, changedByType: 'admin', reason },
    });

    timer.point('createAuditLog')
    await createAuditLog(fromCurrentUser(user, `COMPANY_${status}`, 'company', companyId, {
      changes: { from: previousStatus, to: status, reason },
    }));

    if (status === 'ACTIVE' || status === 'CANCELLED') {
      timer.point('actionQueueItem.updateMany')
      await prisma.actionQueueItem.updateMany({
        where: { referenceId: companyId, referenceType: 'company', status: 'PENDING' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }

    if (status === 'ACTIVE' && previousStatus !== 'ACTIVE') {
      timer.point('sendLaunchPack')
      try {
        await sendLaunchPack(companyId, user.id)
      } catch (err) {
        console.error('Launch pack failed for company', companyId, err)
      }
    }

    if (status === 'ACTIVE' || status === 'SUSPENDED') {
      const template = status === 'ACTIVE'
        ? BUSINESS_NOTIFICATION_TEMPLATES.companyApproved(company.name)
        : {
            type: 'SYSTEM' as const,
            title: `Company application update: ${company.name}`,
            message: 'Your company application was rejected. Contact support for details.',
            priority: 'HIGH' as const,
          };
      await publishBusinessToCompanyAdmins(companyId, {
        ...template,
        channels: channels('IN_APP', 'PUSH', 'EMAIL'),
        referenceType: 'company',
        referenceId: companyId,
        metadata: { previousStatus, status, reason: reason ?? null },
      });
    }

    timer.section('Serialization')
    timer.point('NextResponse.json')
    timer.end()
    return NextResponse.json({ success: true, data: company, message: `Company ${status.toLowerCase()} successfully` });
  } catch (error: any) {
    timer.end()
    if (error?.name === 'ZodError') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'Validation failed', details: error.errors } },
        { status: 400 },
      );
    }
    return internalError(error);
  }
}

// DELETE /api/admin/companies — soft-delete a company
export async function DELETE(request: NextRequest) {
  const timer = createPerfTimer('DELETE /api/admin/companies')
  timer.section('Authentication')
  try {
    const user = await getCurrentUser(timer);
    timer.point('user auth check')
    if (!user || user.userType !== 'admin') return unauthorized();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'Company ID is required' } },
        { status: 400 },
      );
    }

    timer.section('Database Queries')
    timer.point('company.findUnique')
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) return notFound('Company');

    timer.point('company.update (soft delete)')
    await prisma.company.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: user.id, status: 'CANCELLED' },
    });

    timer.point('employee.updateMany (cascade)')
    await prisma.employee.updateMany({
      where: { companyId: id, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: user.id, status: 'INACTIVE' },
    });

    timer.point('createAuditLog')
    await createAuditLog(fromCurrentUser(user, 'COMPANY_DELETED', 'company', id, {
      changes: { name: existing.name, email: existing.email },
    }));

    timer.section('Serialization')
    timer.point('NextResponse.json')
    timer.end()
    return NextResponse.json({ success: true, data: null, message: 'Company and its employees deleted successfully' });
  } catch (error) {
    timer.end()
    return internalError(error);
  }
}
