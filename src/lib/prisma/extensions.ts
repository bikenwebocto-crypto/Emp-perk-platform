import { Prisma } from '@prisma/client';
import { prisma } from './client';

// Soft delete middleware
prisma.$use(async (params, next) => {
  const modelsWithSoftDelete = ['Company', 'Employee', 'Merchant'];
  const isSoftDeleteModel = modelsWithSoftDelete.includes(params.model ?? '');

  // Intercept find queries to exclude soft-deleted records
  if (isSoftDeleteModel) {
    if (params.action === 'findUnique' || params.action === 'findFirst') {
      params.action = 'findFirst';
      params.args.where = { ...params.args.where, deletedAt: null };
    }
    if (params.action === 'findMany') {
      if (!params.args?.where?.deletedAt) {
        params.args.where = { ...params.args.where, deletedAt: null };
      }
    }
  }

  return next(params);
});

// NOTE: automatic Prisma audit middleware was removed. It wrote a second,
// unattributed `system` row for every update/delete on Merchant, Company,
// MerchantOffer and Employee, duplicating the explicit, correctly attributed
// audit rows written by the application. All audit writes are now explicit and
// part of the operation that produced them (see src/services/audit-log.service.ts).

// Pagination helper
export async function paginate<T>(
  model: {
    findMany: (args: Prisma.Args<typeof prisma, 'findMany'>) => Promise<T[]>;
    count: (args: Prisma.Args<typeof prisma, 'count'>) => Promise<number>;
  },
  args: Prisma.Args<typeof prisma, 'findMany'>,
  page: number = 1,
  pageSize: number = 20
): Promise<{
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}> {
  const skip = (page - 1) * pageSize;
  const [data, total] = await Promise.all([
    model.findMany({
      ...args,
      skip,
      take: pageSize,
    }),
    model.count({
      where: args.where,
    }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return {
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
