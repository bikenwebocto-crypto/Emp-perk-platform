import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/supabase/server';
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service';

// CONVERTED is set only by the merchant/company create routes.
const patchLeadSchema = z.object({
  status: z.enum(['CONTACTED', 'REJECTED']),
  note: z.string().trim().max(2000).optional(),
}).strict();

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

function notFound() {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Lead not found' } },
    { status: 404 },
  );
}

function internalError(error: unknown) {
  console.error('Admin lead API error:', error);
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 },
  );
}

// GET /api/admin/leads/[id] — the full lead
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (user.userType !== 'admin') return forbidden();

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return notFound();

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        merchant: { select: { id: true, businessName: true } },
        company: { select: { id: true, name: true } },
      },
    });
    if (!lead) return notFound();

    return NextResponse.json({ success: true, data: lead });
  } catch (error) {
    return internalError(error);
  }
}

// PATCH /api/admin/leads/[id] — NEW → CONTACTED | REJECTED, with optional internal note
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (user.userType !== 'admin') return forbidden();

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return notFound();

    const body = await request.json().catch(() => null);
    const parsed = patchLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'Validation failed', details: parsed.error.flatten().fieldErrors } },
        { status: 400 },
      );
    }
    const { status, note } = parsed.data;

    // Conditional update so a concurrent conversion or status change is not overwritten.
    const result = await prisma.lead.updateMany({
      where: { id, status: 'NEW' },
      data: { status },
    });
    if (result.count === 0) {
      const existing = await prisma.lead.findUnique({ where: { id }, select: { status: true } });
      if (!existing) return notFound();
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_TRANSITION', message: `Lead is ${existing.status}; only NEW leads can be updated` } },
        { status: 409 },
      );
    }

    // The leads table has no note column; the note lives in the audit trail.
    await createAuditLog(fromCurrentUser(user, `LEAD_${status}`, 'lead', id, {
      changes: { from: 'NEW', to: status },
      metadata: note ? { note } : undefined,
    }));

    const lead = await prisma.lead.findUnique({ where: { id } });
    return NextResponse.json({ success: true, data: lead, message: `Lead marked ${status.toLowerCase()}` });
  } catch (error) {
    return internalError(error);
  }
}
