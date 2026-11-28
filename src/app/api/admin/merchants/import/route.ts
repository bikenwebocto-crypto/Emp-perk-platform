import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { parse } from 'csv-parse/sync';
import { validateUserEmail } from '@/services/user-validation.service';
import { selectableCategoryWhere } from '@/lib/categories';
import { requireRole } from '@/lib/api-auth';
import { createAuditLog } from '@/services/audit-log.service';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(['admin']);
    if (authResult instanceof NextResponse) return authResult;
    const adminId = authResult.user.profileId;
    if (!adminId) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_ADMIN_PROFILE', message: 'Admin profile not found' } },
        { status: 403 },
      );
    }
    const importId = crypto.randomUUID();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'CSV file is required' } },
        { status: 400 },
      );
    }

    const text = await file.text();
    const rows: Record<string, string>[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'CSV file is empty' } },
        { status: 400 },
      );
    }

    const results: { row: number; businessName: string; success: boolean; action: string; error?: string }[] = [];
    let imported = 0;
    const skipped = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;

      try {
        const businessName = (row.businessName ?? '').trim();
        const email = (row.email ?? '').trim().toLowerCase();
        const contactName = (row.contactName ?? '').trim();
        const categoryName = (row.categoryName ?? '').trim();
        const categoryIdInput = (row.categoryId ?? '').trim();
        let categoryId: string | null = null;

        if (!businessName || !email || !contactName) {
          failed++;
          results.push({ row: i + 1, businessName: businessName || 'Unknown', success: false, action: 'failed', error: 'Missing required fields: businessName, email, contactName' });
          continue;
        }

        if (categoryName || categoryIdInput) {
          const category = await prisma.category.findFirst({
            where: {
              ...selectableCategoryWhere,
              ...(categoryName
                ? { name: { equals: categoryName, mode: 'insensitive' as const } }
                : { id: categoryIdInput }),
            },
            select: { id: true },
          });
          if (!category) {
            failed++;
            results.push({ row: i + 1, businessName, success: false, action: 'failed', error: 'Category must match an active platform category name' });
            continue;
          }
          categoryId = category.id;
        }

        const existingAccount = await prisma.account.findUnique({ where: { email } });
        if (existingAccount) {
          if (existingAccount.profileType !== 'MERCHANT') {
            failed++;
            results.push({ row: i + 1, businessName, success: false, action: 'failed', error: 'Email is already assigned to another account type' });
            continue;
          }
          const existingMerchant = await prisma.merchant.findFirst({ where: { accountId: existingAccount.authUserId } });
          if (!existingMerchant) { failed++; results.push({ row: i + 1, businessName, success: false, action: 'failed', error: 'Merchant record not found' }); continue; }
          const updateData = {
              contactName,
              contactPhone: (row.contactPhone ?? '').trim() || null,
              description: (row.description ?? '').trim() || null,
              website: (row.website ?? '').trim() || null,
              categoryId,
              addressLine1: (row.addressLine1 ?? '').trim() || null,
              addressLine2: (row.addressLine2 ?? '').trim() || null,
              city: (row.city ?? '').trim() || null,
              state: (row.state ?? '').trim() || null,
              postalCode: (row.postalCode ?? '').trim() || null,
              country: (row.country ?? '').trim() || null,
          };
          const before = Object.fromEntries(
            Object.keys(updateData).map((k) => [k, (existingMerchant as any)[k] ?? null]),
          );
          await prisma.$transaction(async (tx) => {
            await tx.merchant.update({ where: { id: existingMerchant.id }, data: updateData });
            await createAuditLog({
              actorType: 'admin',
              adminId,
              action: 'MERCHANT_IMPORT_UPDATED',
              entityType: 'merchant',
              entityId: existingMerchant.id,
              changes: { before, after: updateData },
              metadata: { importId, row: i + 1, fileName: file.name },
            }, tx);
          });
          imported++;
          results.push({ row: i + 1, businessName, success: true, action: 'updated' });
          continue;
        }

        const validation = await validateUserEmail(email);
        if (validation.exists) {
          failed++;
          results.push({ row: i + 1, businessName, success: false, action: 'failed', error: 'Email is already assigned to another account' });
          continue;
        }

        const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now() + '-' + i;
        const rawStatus = (row.status ?? '').trim().toUpperCase();
        const status = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'].includes(rawStatus) ? rawStatus : 'PENDING';

        const accountStatus = status === 'ACTIVE' ? 'ACTIVE' : 'PENDING';

        await prisma.$transaction(async (tx) => {
          const pkId = crypto.randomUUID();
          const account = await tx.account.create({
            data: {
              authUserId: pkId,
              email,
              role: 'MERCHANT',
              profileType: 'MERCHANT',
              status: accountStatus as any,
            },
          });

          const merchant = await tx.merchant.create({
            data: {
              id: pkId,
              accountId: pkId,
              businessName,
              slug,
              contactName,
              contactPhone: (row.contactPhone ?? '').trim() || null,
              description: (row.description ?? '').trim() || null,
              website: (row.website ?? '').trim() || null,
              categoryId,
              addressLine1: (row.addressLine1 ?? '').trim() || null,
              addressLine2: (row.addressLine2 ?? '').trim() || null,
              city: (row.city ?? '').trim() || null,
              state: (row.state ?? '').trim() || null,
              postalCode: (row.postalCode ?? '').trim() || null,
              country: (row.country ?? '').trim() || null,
              status: status as any,
              onboardingStep: status === 'ACTIVE' ? 'COMPLETE' : 'APPLICATION',
            },
          });

          await createAuditLog({
            actorType: 'admin',
            adminId,
            action: 'MERCHANT_IMPORT_CREATED',
            entityType: 'merchant',
            entityId: merchant.id,
            changes: { email: account.email, businessName, status, accountStatus },
            metadata: { importId, row: i + 1, fileName: file.name },
          }, tx);
        });

        imported++;
        results.push({ row: i + 1, businessName, success: true, action: 'created' });
      } catch (err: any) {
        failed++;
        results.push({ row: i + 1, businessName: row.businessName ?? 'Unknown', success: false, action: 'failed', error: err.message ?? 'Unexpected error' });
      }
    }

    await createAuditLog({
      actorType: 'admin',
      adminId,
      action: 'MERCHANT_CSV_IMPORTED',
      entityType: 'merchant_import',
      entityId: importId,
      metadata: { fileName: file.name, total: rows.length, imported, skipped, failed },
    });

    return NextResponse.json({
      success: true,
      data: {
        total: rows.length,
        imported,
        skipped,
        failed,
        results,
      },
      message: `${imported} imported, ${skipped} skipped, ${failed} failed`,
    });
  } catch (error: any) {
    console.error('Merchant import error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: error.message ?? 'Internal server error' } },
      { status: 500 },
    );
  }
}
