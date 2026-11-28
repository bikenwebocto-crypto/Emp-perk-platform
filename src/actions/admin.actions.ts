'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/supabase/server';
import { createAuditLog } from '@/services/audit-log.service';
import { adminApproveMerchantSchema, adminApproveOfferSchema, adminCompanyActionSchema } from '@/schemas';
import type { MerchantStatus, OfferStatus, CompanyStatus } from '@/types';
import { canActivatePendingCompany } from '@/lib/access/company-access';

// ============================================================
// MERCHANT ACTIONS
// ============================================================

export async function approveMerchantAction(formData: FormData) {
  const raw = {
    merchantId: formData.get('merchantId') as string,
    status: formData.get('status') as MerchantStatus,
    rejectionReason: formData.get('rejectionReason') as string | undefined,
  };

  const parsed = adminApproveMerchantSchema.parse(raw);

  const merchant = await prisma.merchant.update({
    where: { id: parsed.merchantId },
    data: {
      status: parsed.status as any,
      rejectionReason: parsed.rejectionReason,
      approvedAt: parsed.status === 'ACTIVE' ? new Date() : undefined,
      liveAt: parsed.status === 'ACTIVE' ? new Date() : undefined,
    },
  });

  // Create status history
  await prisma.merchantStatusHistory.create({
    data: {
      merchantId: parsed.merchantId,
      toStatus: parsed.status as any,
      changedBy: 'system', // TODO: get from auth context
      changedByType: 'admin',
      reason: parsed.rejectionReason,
    },
  });

  // Update action queue item
  await prisma.actionQueueItem.updateMany({
    where: { referenceId: parsed.merchantId, referenceType: 'merchant', status: 'PENDING' },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  revalidatePath('/admin/merchants');
  revalidatePath('/admin/action-queue');

  return { success: true, merchant };
}

export async function getPendingMerchantsAction(page = 1, pageSize = 20) {
  const [merchants, total] = await Promise.all([
    prisma.merchant.findMany({
      where: { status: 'PENDING', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        category: true,
        _count: { select: { offers: true } },
      },
    }),
    prisma.merchant.count({ where: { status: 'PENDING', deletedAt: null } }),
  ]);

  return {
    data: merchants,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: page * pageSize < total,
      hasPreviousPage: page > 1,
    },
  };
}

// ============================================================
// OFFER ACTIONS
// ============================================================

export async function approveOfferAction(formData: FormData) {
  const raw = {
    offerId: formData.get('offerId') as string,
    status: formData.get('status') as OfferStatus,
    rejectionReason: formData.get('rejectionReason') as string | undefined,
  };

  const parsed = adminApproveOfferSchema.parse(raw);

  const user = await getCurrentUser();
  if (!user || user.userType !== 'admin' || !user.profileId) {
    throw new Error('Only an admin can review offers.');
  }
  const adminId = user.profileId;

  // Review, one-live-offer replacement and their audit rows commit together.
  const offer = await prisma.$transaction(async (tx) => {
    const before = await tx.merchantOffer.findUnique({
      where: { id: parsed.offerId },
      select: { status: true },
    });
    const updated = await tx.merchantOffer.update({
      where: { id: parsed.offerId },
      data: {
        status: parsed.status as any,
        reviewedAt: new Date(),
        liveAt: parsed.status === 'LIVE' ? new Date() : undefined,
      },
    });

    await tx.offerReview.upsert({
      where: { offerId: parsed.offerId },
      create: {
        offerId: parsed.offerId,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason: parsed.rejectionReason ?? null,
      },
      update: {
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason: parsed.rejectionReason ?? null,
      },
    });

    await createAuditLog({
      actorType: 'admin',
      adminId,
      action: parsed.status === 'LIVE' ? 'OFFER_APPROVED' : `OFFER_REVIEWED_${parsed.status}`,
      entityType: 'merchant_offer',
      entityId: parsed.offerId,
      changes: { status: { from: before?.status ?? null, to: parsed.status } },
      metadata: { merchantId: updated.merchantId, rejectionReason: parsed.rejectionReason ?? null },
    }, tx);

    // If approved, replace the previous live offer (one live offer rule)
    if (parsed.status === 'LIVE') {
      const replaced = await tx.merchantOffer.findMany({
        where: { merchantId: updated.merchantId, status: 'LIVE', id: { not: parsed.offerId } },
        select: { id: true },
      });
      if (replaced.length) {
        await tx.merchantOffer.updateMany({
          where: { id: { in: replaced.map((o) => o.id) }, status: 'LIVE' },
          data: { status: 'REPLACED' },
        });
        for (const r of replaced) {
          await createAuditLog({
            actorType: 'admin',
            adminId,
            action: 'OFFER_REPLACED',
            entityType: 'merchant_offer',
            entityId: r.id,
            changes: { status: { from: 'LIVE', to: 'REPLACED' } },
            metadata: { replacedByOfferId: parsed.offerId, merchantId: updated.merchantId },
          }, tx);
        }
      }
    }

    return updated;
  });

  // Update action queue
  await prisma.actionQueueItem.updateMany({
    where: { referenceId: parsed.offerId, referenceType: 'offer', status: 'PENDING' },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  revalidatePath('/admin/merchants');
  revalidatePath('/admin/action-queue');

  return { success: true, offer };
}

// ============================================================
// COMPANY ACTIONS
// ============================================================

export async function updateCompanyStatusAction(formData: FormData) {
  const raw = {
    companyId: formData.get('companyId') as string,
    status: formData.get('status') as CompanyStatus,
    reason: formData.get('reason') as string | undefined,
  };

  const parsed = adminCompanyActionSchema.parse(raw);

  if (parsed.status === 'APPROVED_PENDING_PAYMENT') {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') {
      throw new Error('Only an admin can approve a company for payment.')
    }
  }

  if (parsed.status === 'ACTIVE') {
    const existing = await prisma.company.findUnique({
      where: { id: parsed.companyId },
      select: { status: true },
    })
    if (existing?.status === 'PENDING') {
      throw new Error('Approve the company and confirm payment before activation.')
    }
    if (existing && !canActivatePendingCompany(existing.status, (await getCurrentUser())?.adminRole)) {
      throw new Error('Only a Super Admin can activate a pending company.')
    }
  }

  const company = await prisma.company.update({
    where: { id: parsed.companyId },
    data: { status: parsed.status as any, notes: parsed.reason },
  });

  await prisma.companyStatusHistory.create({
    data: {
      companyId: parsed.companyId,
      toStatus: parsed.status as any,
      changedBy: 'system',
      changedByType: 'admin',
      reason: parsed.reason,
    },
  });

  revalidatePath('/admin/companies');
  return { success: true, company };
}

// ============================================================
// ACTION QUEUE
// ============================================================

export async function getActionQueueAction(filters?: {
  status?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;

  const where: Record<string, unknown> = {};
  if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
  if (filters?.type && filters.type !== 'ALL') where.type = filters.type;

  const [items, total] = await Promise.all([
    prisma.actionQueueItem.findMany({
      where: where as any,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        merchant: { select: { id: true, businessName: true } },
      },
    }),
    prisma.actionQueueItem.count({ where: where as any }),
  ]);

  return {
    data: items,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: page * pageSize < total,
      hasPreviousPage: page > 1,
    },
  };
}

export async function claimActionItemAction(itemId: string) {
  await prisma.actionQueueItem.update({
    where: { id: itemId },
    data: { status: 'IN_PROGRESS', assignedTo: 'system' },
  });

  revalidatePath('/admin/action-queue');
  return { success: true };
}
