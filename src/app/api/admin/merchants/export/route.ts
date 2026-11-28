import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stringify } from 'csv-stringify/sync';

const COLUMNS = [
  'status', 'businessName', 'email', 'contactName', 'contactPhone',
  'password',
  'description', 'website', 'categoryName',
  'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country',
] as const;

export async function GET() {
  const merchants = await prisma.merchant.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      accountId: true,
      status: true,
      businessName: true,
      contactName: true,
      contactPhone: true,
      description: true,
      website: true,
      category: { select: { name: true } },
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
    },
  });

  const merchantAccountIds = merchants.map((m) => m.accountId).filter(Boolean) as string[]
  const merchantAccounts = merchantAccountIds.length > 0
    ? await prisma.account.findMany({ where: { authUserId: { in: merchantAccountIds } }, select: { authUserId: true, email: true } })
    : []
  const emailMap = new Map(merchantAccounts.map((a) => [a.authUserId, a.email]))

  const rows = merchants.map((m) => ({
    status: m.status,
    businessName: m.businessName,
    email: emailMap.get(m.accountId ?? '') ?? '',
    contactName: m.contactName,
    contactPhone: m.contactPhone ?? '',
    password: '',
    description: m.description ?? '',
    website: m.website ?? '',
    categoryName: m.category?.name ?? '',
    addressLine1: m.addressLine1 ?? '',
    addressLine2: m.addressLine2 ?? '',
    city: m.city ?? '',
    state: m.state ?? '',
    postalCode: m.postalCode ?? '',
    country: m.country ?? '',
  }));

  const csv = stringify(rows, { header: true, columns: COLUMNS as unknown as string[] });
  const filename = `merchants-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
