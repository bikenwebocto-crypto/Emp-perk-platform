import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/supabase/server';

const LEAD_TYPES = ['MERCHANT', 'EMPLOYER'] as const;
const LEAD_STATUSES = ['NEW', 'CONTACTED', 'REJECTED', 'CONVERTED'] as const;

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 },
  );
}

function forbidden() {
  return NextResponse.json(
    { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
    { status: 403 },
  );
}

// GET /api/admin/leads
//
// Query params:
//   - type     : MERCHANT | EMPLOYER
//   - status   : NEW | CONTACTED | REJECTED | CONVERTED
//   - q        : search across company name, email, first/last name
//   - page, pageSize
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (user.userType !== 'admin') return forbidden();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const q = searchParams.get('q')?.trim();
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1') || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20') || 20));

    const where: Prisma.LeadWhereInput = {};
    if (type && (LEAD_TYPES as readonly string[]).includes(type)) where.type = type as Prisma.LeadWhereInput['type'];
    if (status && (LEAD_STATUSES as readonly string[]).includes(status)) where.status = status as Prisma.LeadWhereInput['status'];
    if (q) {
      const parts = q.split(/\s+/).filter(Boolean);
      where.OR = [
        { companyName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        // "Ada Lovelace" matches first + last name together.
        ...(parts.length >= 2
          ? [{ AND: [
              { firstName: { contains: parts[0]!, mode: 'insensitive' as const } },
              { lastName: { contains: parts.slice(1).join(' '), mode: 'insensitive' as const } },
            ] }]
          : []),
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          merchant: { select: { id: true, businessName: true } },
          company: { select: { id: true, name: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: leads,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), hasNextPage: page * pageSize < total, hasPreviousPage: page > 1 },
    });
  } catch (error) {
    console.error('Admin leads API error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
