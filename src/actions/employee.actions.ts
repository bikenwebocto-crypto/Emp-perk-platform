'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { issueReportSchema } from '@/schemas';

// ============================================================
// ISSUE REPORTS
// ============================================================

export async function reportIssueAction(formData: FormData) {
  const raw = {
    merchantId: formData.get('merchantId') as string,
    redemptionId: formData.get('redemptionId') as string | undefined,
    title: formData.get('title') as string,
    description: formData.get('description') as string,
    category: formData.get('category') as string,
    priority: formData.get('priority') as string,
  };

  const parsed = issueReportSchema.parse(raw);

  const issue = await prisma.issueReport.create({
    data: {
      merchantId: parsed.merchantId,
      employeeId: 'system', // TODO: from auth
      redemptionId: parsed.redemptionId || null,
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
      priority: parsed.priority,
      status: 'OPEN',
    },
  });

  // Auto-create action queue item for admin
  await prisma.actionQueueItem.create({
    data: {
      type: 'ISSUE_REVIEW',
      title: `Issue Report: ${parsed.title}`,
      description: `New issue reported by employee. Category: ${parsed.category}`,
      referenceId: issue.id,
      referenceType: 'issue',
      status: 'PENDING',
      priority: 3,
    },
  });

  revalidatePath('/employee/profile');
  return { success: true, issue };
}

// ============================================================
// OFFERS
// ============================================================

export async function getLiveOffersAction(companyId: string, page = 1, pageSize = 20) {
  const now = new Date();

  const [offers, total] = await Promise.all([
    prisma.merchantOffer.findMany({
      where: {
        deletedAt: null,
        status: 'LIVE',
        startDate: { lte: now },
        endDate: { gte: now },
        merchant: {
          status: 'ACTIVE',
          deletedAt: null,
        },
      },
      orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        content: { select: { description: true, shortDescription: true, imageUrls: true } },
        pricing: { select: { configuration: true } },
        redemption: { select: { redemptionType: true, configuration: true } },
        merchant: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            logoUrl: true,
            city: true,
            state: true,
            averageRating: true,
            categoryId: true,
            description: true,
          },
        },
      },
    }),
    prisma.merchantOffer.count({
      where: {
        deletedAt: null,
        status: 'LIVE',
        startDate: { lte: now },
        endDate: { gte: now },
        merchant: { status: 'ACTIVE', deletedAt: null },
      },
    }),
  ]);

  return {
    data: offers,
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
