import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { validateUserEmail, createAccountForProfile } from '@/services/user-validation.service';
import { publishBusinessToAdmins } from '@/services/business-notification.service';

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      businessName, email, contactName, contactPhone,
      categoryId, description, website,
      logoUrl, coverImageUrl,
      addressLine1, addressLine2, city, state, postalCode, country,
      requiresApproval,
    } = body;

    if (!businessName || !email ||  !contactName) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'Missing required fields: businessName, email, password, contactName' } },
        { status: 400 },
      );
    }

    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_CATEGORY', message: 'Selected category does not exist.' } },
          { status: 400 },
        );
      }
    }

    const validation = await validateUserEmail(email);
    if (validation.exists) {
      return NextResponse.json(
        { success: false, error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Email is already assigned to another account' } },
        { status: 409 },
      );
    }

    const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();

    const result = await prisma.$transaction(async (tx) => {
      const pkId = crypto.randomUUID();
      const account = await tx.account.create({
        data: {
          authUserId: pkId,
          email,
          role: 'MERCHANT',
          profileType: 'MERCHANT',
          status: 'PENDING',
        },
      });

      const merchant = await tx.merchant.create({
        data: {
          id: pkId,
          businessName,
          slug,
          contactName,
          contactPhone: contactPhone || null,
          categoryId: categoryId || null,
          description: description || null,
          website: website || null,
          logoUrl: logoUrl || null,
          coverImageUrl: coverImageUrl || null,
          addressLine1: addressLine1 || null,
          addressLine2: addressLine2 || null,
          city: city || null,
          state: state || null,
          postalCode: postalCode || null,
          country: country || null,
          status: 'PENDING',
          onboardingStep: 'DOCUMENTS',
          accountId: pkId,
        },
      });

      if (requiresApproval) {
        await tx.actionQueueItem.create({
          data: {
            type: 'NEW_MERCHANT_APPLICATION',
            title: `New merchant application: ${merchant.businessName}`,
            description: `Merchant application submitted for ${merchant.businessName} and requires board approval.`,
            referenceId: merchant.id,
            referenceType: 'merchant',
            status: 'PENDING',
            priority: 3,
            metadata: { queueType: 'NEW_MERCHANT_APPLICATION' },
          },
        });
      }

      return merchant;
    });

    // Admin-created merchants (requiresApproval not set) are live immediately and need no board review.
    if (requiresApproval) {
      await publishBusinessToAdmins({
        type: 'SYSTEM',
        title: `New merchant application: ${result.businessName}`,
        message: 'A merchant application is waiting for board approval.',
        priority: 'HIGH',
        channels: ['IN_APP', 'PUSH'],
        referenceType: 'merchant',
        referenceId: result.id,
        metadata: { merchantId: result.id },
      });
    }

    return NextResponse.json(
      { success: true, data: result, message: 'Merchant created successfully' },
      { status: 201 },
    );
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'A merchant with this email already exists' } },
        { status: 409 },
      );
    }
    console.error('Merchant create error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
