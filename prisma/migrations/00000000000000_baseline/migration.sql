-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('SUPER_ADMIN', 'COMPANY_ADMIN', 'EMPLOYEE', 'MERCHANT');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING');

-- CreateEnum
CREATE TYPE "ActionQueueStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ActionQueueType" AS ENUM ('NEW_MERCHANT_APPLICATION', 'FIRST_OFFER_APPROVAL', 'OFFER_REPLACEMENT', 'PROFILE_EDIT_REQUEST', 'COMPANY_ACTIVATION', 'ISSUE_REVIEW', 'CSV_IMPORT', 'BRANCH_EDIT_REQUEST', 'ASSET_REVIEW');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN', 'CONTENT_ADMIN');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('ACTIVE', 'INVOICE_OVERDUE', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "BranchType" AS ENUM ('IN_STORE', 'ONLINE');

-- CreateEnum
CREATE TYPE "CSVUploadStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('PENDING', 'APPROVED_PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ComplaintPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CLARIFICATION_REQ', 'ESCALATED', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ComplaintType" AS ENUM ('MISLEADING', 'INVALID_TERMS', 'NON_FUNCTIONAL', 'POLICY_VIOLATION');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('INVITED', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'INELIGIBLE');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MerchantOnboardingStep" AS ENUM ('APPLICATION', 'DOCUMENTS', 'AGREEMENT', 'COMPLETE');

-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'LIVE', 'REJECTED', 'EXPIRED', 'REPLACED', 'VALIDATION_IN_PROGRESS', 'AWAITING_APPROVAL', 'VALIDATION_FAILED', 'ARCHIVED', 'CHANGES_REQUESTED', 'FULL');

-- CreateEnum
CREATE TYPE "ProfileType" AS ENUM ('ADMIN', 'COMPANY', 'EMPLOYEE', 'MERCHANT');

-- CreateEnum
CREATE TYPE "RealtimeEventType" AS ENUM ('REDEMPTION_CREATED', 'REDEMPTION_UPDATED', 'MERCHANT_STATUS_CHANGED', 'COMPANY_STATUS_CHANGED', 'OFFER_STATUS_CHANGED', 'ACTION_QUEUE_UPDATED', 'ANALYTICS_UPDATED', 'ISSUE_REPORTED', 'NOTIFICATION_CREATED', 'EMPLOYEE_STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "ReplacementStatus" AS ENUM ('PENDING', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'CLARIFICATION_REQUESTED');

-- CreateEnum
CREATE TYPE "SavingMethod" AS ENUM ('AUTO_PERCENTAGE', 'AUTO_FIXED', 'MANUAL');

-- CreateTable
CREATE TABLE "LoginBranding" (
    "id" UUID NOT NULL,
    "appName" TEXT,
    "tagline" TEXT,
    "heading" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "backgroundImageUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "textColor" TEXT,
    "cardBackground" TEXT,
    "layout" TEXT NOT NULL DEFAULT 'SPLIT_CARD',
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showHeading" BOOLEAN NOT NULL DEFAULT true,
    "showDescription" BOOLEAN NOT NULL DEFAULT true,
    "showBanner" BOOLEAN NOT NULL DEFAULT true,
    "showFooter" BOOLEAN NOT NULL DEFAULT true,
    "footerTitle" TEXT,
    "footerDescription" TEXT,
    "copyright" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantReview" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "offerId" UUID,
    "redemptionId" UUID,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Theme" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "authUserId" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "AccountRole" NOT NULL,
    "profileType" "ProfileType" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" VARCHAR(255),
    "changedBy" VARCHAR(255),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("authUserId")
);

-- CreateTable
CREATE TABLE "action_queue_items" (
    "id" UUID NOT NULL,
    "type" "ActionQueueType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "referenceId" UUID NOT NULL,
    "referenceType" VARCHAR(50) NOT NULL,
    "status" "ActionQueueStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "assignedTo" UUID,
    "metadata" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'SUPPORT_ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "avatarUrl" VARCHAR(500),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" UUID,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorType" VARCHAR(50) NOT NULL,
    "adminId" UUID,
    "merchantId" UUID,
    "companyId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" UUID NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyAdminId" UUID,
    "employeeId" UUID,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banner_bookings" (
    "id" UUID NOT NULL,
    "bannerId" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banner_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banner_contents" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "imageUrl" VARCHAR(500) NOT NULL,
    "altText" VARCHAR(255),
    "redirectUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banner_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "position" VARCHAR(50) NOT NULL,
    "pricePerDay" DECIMAL(10,2) NOT NULL DEFAULT 10.0,
    "minDays" INTEGER NOT NULL DEFAULT 7,
    "maxDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "icon" VARCHAR(50),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "logoUrl" VARCHAR(500),
    "website" VARCHAR(500),
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "status" "CompanyStatus" NOT NULL DEFAULT 'PENDING',
    "addressLine1" VARCHAR(255),
    "addressLine2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "postalCode" VARCHAR(20),
    "country" VARCHAR(100),
    "taxId" VARCHAR(50),
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "adminNote" VARCHAR(500),
    "approvedById" UUID,
    "approvedDomain" VARCHAR(255),
    "deletedById" UUID,
    "industry" VARCHAR(100),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_admins" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" UUID,

    CONSTRAINT "company_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_billing" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "plan" VARCHAR(50) NOT NULL,
    "billingEmail" VARCHAR(255),
    "billingCycle" VARCHAR(20) NOT NULL DEFAULT 'monthly',
    "pricePerEmployee" DECIMAL(10,2) NOT NULL DEFAULT 5.0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'GBP',
    "stripeCustomerId" VARCHAR(255),
    "stripeSubscriptionId" VARCHAR(255),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "paymentMethodLast4" VARCHAR(4),
    "nextBillingDate" TIMESTAMP(3),
    "invoiceCount" INTEGER NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'ACTIVE',
    "renewalDate" TIMESTAMP(3),

    CONSTRAINT "company_billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_status_history" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fromStatus" "CompanyStatus",
    "toStatus" "CompanyStatus" NOT NULL,
    "changedBy" UUID NOT NULL,
    "changedByType" VARCHAR(50) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_actions" (
    "id" UUID NOT NULL,
    "complaintId" UUID NOT NULL,
    "actorType" VARCHAR(50) NOT NULL,
    "adminId" UUID,
    "companyAdminId" UUID,
    "employeeId" UUID,
    "merchantId" UUID,
    "actionType" VARCHAR(50) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_escalations" (
    "id" UUID NOT NULL,
    "complaintId" UUID NOT NULL,
    "companyAdminId" UUID NOT NULL,
    "superAdminId" UUID,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "complaintType" "ComplaintType" NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceUrls" JSONB,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ComplaintPriority" NOT NULL DEFAULT 'MEDIUM',
    "escalationNote" TEXT,
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csv_rejected_rows" (
    "id" UUID NOT NULL,
    "csvUploadId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "rowData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "csv_rejected_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csv_upload_jobs" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "adminId" UUID,
    "fileName" VARCHAR(255) NOT NULL,
    "fileUrl" VARCHAR(500) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "status" "CSVUploadStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "metadata" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "csv_upload_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_offer_analytics" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "revenueGenerated" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_offer_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "platform" VARCHAR(50) NOT NULL DEFAULT 'web',
    "deviceId" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "userType" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_addresses" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "addressLine1" VARCHAR(255),
    "addressLine2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "postalCode" VARCHAR(20),
    "country" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "employeeId" VARCHAR(100),
    "department" VARCHAR(100),
    "jobTitle" VARCHAR(100),
    "phone" VARCHAR(50),
    "avatarUrl" VARCHAR(500),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3),
    "invitedBy" UUID,
    "lastLoginAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" UUID,
    "approvedById" UUID,
    "deletedById" UUID,
    "joinMethod" VARCHAR(50),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_banners" (
    "id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "subtitle" VARCHAR(500),
    "imageUrl" VARCHAR(500) NOT NULL,
    "linkUrl" VARCHAR(500),
    "linkText" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "discountBadge" VARCHAR(50),
    "headline" VARCHAR(255),
    "merchantId" UUID,
    "subtext" VARCHAR(500),

    CONSTRAINT "hero_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_reports" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "employeeId" UUID,
    "redemptionId" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "adminId" UUID,
    "adminNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_sessions" (
    "id" UUID NOT NULL,
    "userType" VARCHAR(50) NOT NULL,
    "adminId" UUID,
    "merchantId" UUID,
    "companyAdminId" UUID,
    "employeeId" UUID,
    "refreshToken" VARCHAR(500) NOT NULL,
    "accessToken" VARCHAR(500),
    "ipAddress" VARCHAR(45),
    "userAgent" VARCHAR(500),
    "deviceInfo" VARCHAR(255),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastActivityAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_branches" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "addressLine1" VARCHAR(255) NOT NULL,
    "addressLine2" VARCHAR(255),
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(100),
    "postalCode" VARCHAR(20) NOT NULL,
    "country" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "branchImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "branchType" "BranchType" NOT NULL DEFAULT 'IN_STORE',
    "deletedAt" TIMESTAMP(3),
    "deliveryRadiusKm" INTEGER,
    "description" TEXT,
    "isNationwide" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "landmark" VARCHAR(500),
    "openingHours" JSONB,
    "parkingInfo" VARCHAR(500),
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "storefrontImageUrl" VARCHAR(500),
    "wheelchairAccess" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "merchant_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_offers" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "offerType" VARCHAR(50) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isExclusive" BOOLEAN NOT NULL DEFAULT false,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "liveAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deletedByRole" VARCHAR(50),
    "replacesOfferId" UUID,

    CONSTRAINT "merchant_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_profile_edit_requests" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "requestedFields" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "adminId" UUID,
    "adminNotes" TEXT,
    "isApproved" BOOLEAN,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_profile_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_status_history" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "fromStatus" "MerchantStatus",
    "toStatus" "MerchantStatus" NOT NULL,
    "changedBy" UUID NOT NULL,
    "changedByType" VARCHAR(50) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "businessName" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "contactName" VARCHAR(255) NOT NULL,
    "contactPhone" VARCHAR(50),
    "description" TEXT,
    "logoUrl" VARCHAR(500),
    "coverImageUrl" VARCHAR(500),
    "website" VARCHAR(500),
    "categoryId" UUID,
    "status" "MerchantStatus" NOT NULL DEFAULT 'PENDING',
    "onboardingStep" "MerchantOnboardingStep" NOT NULL DEFAULT 'APPLICATION',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isTopRated" BOOLEAN NOT NULL DEFAULT false,
    "averageRating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "totalRedemptions" INTEGER NOT NULL DEFAULT 0,
    "totalSavings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "addressLine1" VARCHAR(255),
    "addressLine2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "postalCode" VARCHAR(20),
    "country" VARCHAR(100),
    "socialLinks" JSONB,
    "businessHours" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rejectionReason" TEXT,
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lastOfferSubmitAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" UUID,
    "adminNote" VARCHAR(500),
    "approvedById" UUID,
    "deletedById" UUID,
    "displayPriority" INTEGER NOT NULL DEFAULT 0,
    "isHomepageMerchant" BOOLEAN NOT NULL DEFAULT false,
    "liveAt" TIMESTAMP(3),

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "most_popular_merchants" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "most_popular_merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_events" (
    "id" UUID NOT NULL,
    "recipientType" VARCHAR(50) NOT NULL,
    "adminId" UUID,
    "merchantId" UUID,
    "companyAdminId" UUID,
    "employeeId" UUID,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "referenceType" VARCHAR(50),
    "referenceId" UUID,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" VARCHAR(50),

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "notificationType" VARCHAR(50) NOT NULL,
    "enableInApp" BOOLEAN NOT NULL DEFAULT true,
    "enableEmail" BOOLEAN NOT NULL DEFAULT true,
    "enablePush" BOOLEAN NOT NULL DEFAULT true,
    "enableSms" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_analytics" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_content" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "shortDescription" VARCHAR(500),
    "description" TEXT,
    "termsAndConditions" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "displayData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_pricing" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "pricingType" VARCHAR(50) NOT NULL,
    "configuration" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_redemption_attempts" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "redemptionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_redemption_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_redemption_capacity" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "lastRedeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_redemption_capacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_redemptions" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "redemptionType" VARCHAR(50),
    "configuration" JSONB,
    "maxRedemptions" INTEGER DEFAULT 0,
    "currentRedemptions" INTEGER NOT NULL DEFAULT 0,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_replacement_requests" (
    "id" UUID NOT NULL,
    "currentOfferId" UUID NOT NULL,
    "newOfferId" UUID NOT NULL,
    "reason" TEXT,
    "adminId" UUID,
    "adminNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "ReplacementStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "offer_replacement_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_reviews" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "reviewNotes" TEXT,
    "adminNote" TEXT,
    "submissionNotes" TEXT,
    "replacementReason" TEXT,
    "isReplacement" BOOLEAN NOT NULL DEFAULT false,
    "validationErrors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_views" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "userType" VARCHAR(50) NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "realtime_events" (
    "id" UUID NOT NULL,
    "eventType" "RealtimeEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "channel" VARCHAR(100) NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceType" VARCHAR(50) NOT NULL,
    "idempotencyKey" VARCHAR(255),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realtime_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemption_analytics" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "companyId" UUID,
    "offerId" UUID,
    "date" DATE NOT NULL,
    "totalRedemptions" INTEGER NOT NULL DEFAULT 0,
    "totalDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalSavings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "uniqueEmployees" INTEGER NOT NULL DEFAULT 0,
    "averageDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "redemption_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "redemptionCode" VARCHAR(100),
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "spentAmount" DECIMAL(10,2),
    "savingsAmount" DECIMAL(10,2) NOT NULL,
    "branchId" UUID,
    "merchantNotes" TEXT,
    "employeeNotes" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" UUID,
    "verifiedAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billAmount" DECIMAL(10,2),
    "isRedeemed" BOOLEAN NOT NULL DEFAULT false,
    "isSaved" BOOLEAN NOT NULL DEFAULT false,
    "loggedSavingAmount" DECIMAL(10,2),
    "rejectionReason" TEXT,
    "savedAt" TIMESTAMP(3),
    "savingEditedAt" TIMESTAMP(3),
    "savingLoggedAt" TIMESTAMP(3),
    "savingMethod" "SavingMethod",

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renewal_gaming_alerts" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "alertType" VARCHAR(50) NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renewal_gaming_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_picks" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_picks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantReview_employeeId_merchantId_key" ON "MerchantReview"("employeeId" ASC, "merchantId" ASC);

-- CreateIndex
CREATE INDEX "MerchantReview_merchantId_idx" ON "MerchantReview"("merchantId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantReview_redemptionId_key" ON "MerchantReview"("redemptionId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Theme_slug_key" ON "Theme"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email" ASC);

-- CreateIndex
CREATE INDEX "accounts_role_idx" ON "accounts"("role" ASC);

-- CreateIndex
CREATE INDEX "accounts_status_idx" ON "accounts"("status" ASC);

-- CreateIndex
CREATE INDEX "action_queue_items_assignedTo_idx" ON "action_queue_items"("assignedTo" ASC);

-- CreateIndex
CREATE INDEX "action_queue_items_referenceId_referenceType_idx" ON "action_queue_items"("referenceId" ASC, "referenceType" ASC);

-- CreateIndex
CREATE INDEX "action_queue_items_status_idx" ON "action_queue_items"("status" ASC);

-- CreateIndex
CREATE INDEX "action_queue_items_status_type_idx" ON "action_queue_items"("status" ASC, "type" ASC);

-- CreateIndex
CREATE INDEX "action_queue_items_type_idx" ON "action_queue_items"("type" ASC);

-- CreateIndex
CREATE INDEX "admin_users_role_idx" ON "admin_users"("role" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_adminId_idx" ON "audit_logs"("adminId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_companyAdminId_idx" ON "audit_logs"("companyAdminId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_companyId_idx" ON "audit_logs"("companyId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_employeeId_idx" ON "audit_logs"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_entityType_createdAt_idx" ON "audit_logs"("entityType" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "audit_logs_merchantId_idx" ON "audit_logs"("merchantId" ASC);

-- CreateIndex
CREATE INDEX "banner_bookings_bannerId_idx" ON "banner_bookings"("bannerId" ASC);

-- CreateIndex
CREATE INDEX "banner_bookings_merchantId_idx" ON "banner_bookings"("merchantId" ASC);

-- CreateIndex
CREATE INDEX "banner_bookings_status_idx" ON "banner_bookings"("status" ASC);

-- CreateIndex
CREATE INDEX "banner_bookings_status_paid_startDate_endDate_idx" ON "banner_bookings"("status" ASC, "paid" ASC, "startDate" ASC, "endDate" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "banner_contents_bookingId_key" ON "banner_contents"("bookingId" ASC);

-- CreateIndex
CREATE INDEX "banners_isActive_idx" ON "banners"("isActive" ASC);

-- CreateIndex
CREATE INDEX "banners_position_idx" ON "banners"("position" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug" ASC);

-- CreateIndex
CREATE INDEX "companies_email_idx" ON "companies"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "companies_email_key" ON "companies"("email" ASC);

-- CreateIndex
CREATE INDEX "companies_slug_idx" ON "companies"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug" ASC);

-- CreateIndex
CREATE INDEX "companies_status_deletedAt_idx" ON "companies"("status" ASC, "deletedAt" ASC);

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status" ASC);

-- CreateIndex
CREATE INDEX "company_admins_companyId_idx" ON "company_admins"("companyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "company_billing_companyId_key" ON "company_billing"("companyId" ASC);

-- CreateIndex
CREATE INDEX "company_status_history_companyId_idx" ON "company_status_history"("companyId" ASC);

-- CreateIndex
CREATE INDEX "company_status_history_createdAt_idx" ON "company_status_history"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "complaint_actions_complaintId_idx" ON "complaint_actions"("complaintId" ASC);

-- CreateIndex
CREATE INDEX "complaint_escalations_complaintId_idx" ON "complaint_escalations"("complaintId" ASC);

-- CreateIndex
CREATE INDEX "complaints_companyId_idx" ON "complaints"("companyId" ASC);

-- CreateIndex
CREATE INDEX "complaints_companyId_status_idx" ON "complaints"("companyId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "complaints_employeeId_idx" ON "complaints"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "complaints_merchantId_idx" ON "complaints"("merchantId" ASC);

-- CreateIndex
CREATE INDEX "complaints_offerId_idx" ON "complaints"("offerId" ASC);

-- CreateIndex
CREATE INDEX "complaints_status_idx" ON "complaints"("status" ASC);

-- CreateIndex
CREATE INDEX "csv_rejected_rows_csvUploadId_idx" ON "csv_rejected_rows"("csvUploadId" ASC);

-- CreateIndex
CREATE INDEX "csv_upload_jobs_companyId_idx" ON "csv_upload_jobs"("companyId" ASC);

-- CreateIndex
CREATE INDEX "csv_upload_jobs_status_idx" ON "csv_upload_jobs"("status" ASC);

-- CreateIndex
CREATE INDEX "daily_offer_analytics_date_idx" ON "daily_offer_analytics"("date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "daily_offer_analytics_offerId_date_key" ON "daily_offer_analytics"("offerId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "daily_offer_analytics_offerId_idx" ON "daily_offer_analytics"("offerId" ASC);

-- CreateIndex
CREATE INDEX "device_tokens_token_idx" ON "device_tokens"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token" ASC);

-- CreateIndex
CREATE INDEX "device_tokens_userId_role_idx" ON "device_tokens"("userId" ASC, "role" ASC);

-- CreateIndex
CREATE INDEX "email_verification_tokens_token_idx" ON "email_verification_tokens"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token" ASC);

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_userType_idx" ON "email_verification_tokens"("userId" ASC, "userType" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employee_addresses_employeeId_key" ON "employee_addresses"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "employees_companyId_idx" ON "employees"("companyId" ASC);

-- CreateIndex
CREATE INDEX "employees_companyId_status_idx" ON "employees"("companyId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status" ASC);

-- CreateIndex
CREATE INDEX "hero_banners_merchantId_idx" ON "hero_banners"("merchantId" ASC);

-- CreateIndex
CREATE INDEX "issue_reports_employeeId_idx" ON "issue_reports"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "issue_reports_merchantId_idx" ON "issue_reports"("merchantId" ASC);

-- CreateIndex
CREATE INDEX "issue_reports_status_idx" ON "issue_reports"("status" ASC);

-- CreateIndex
CREATE INDEX "issue_reports_status_priority_idx" ON "issue_reports"("status" ASC, "priority" ASC);

-- CreateIndex
CREATE INDEX "login_sessions_adminId_idx" ON "login_sessions"("adminId" ASC);

-- CreateIndex
CREATE INDEX "login_sessions_companyAdminId_idx" ON "login_sessions"("companyAdminId" ASC);

-- CreateIndex
CREATE INDEX "login_sessions_employeeId_idx" ON "login_sessions"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "login_sessions_isActive_idx" ON "login_sessions"("isActive" ASC);

-- CreateIndex
CREATE INDEX "login_sessions_merchantId_idx" ON "login_sessions"("merchantId" ASC);

-- CreateIndex
CREATE INDEX "login_sessions_refreshToken_idx" ON "login_sessions"("refreshToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "login_sessions_refreshToken_key" ON "login_sessions"("refreshToken" ASC);

-- CreateIndex
CREATE INDEX "merchant_branches_deletedAt_idx" ON "merchant_branches"("deletedAt" ASC);

-- CreateIndex
CREATE INDEX "merchant_branches_merchantId_branchType_idx" ON "merchant_branches"("merchantId" ASC, "branchType" ASC);

-- CreateIndex
CREATE INDEX "merchant_branches_merchantId_idx" ON "merchant_branches"("merchantId" ASC);

-- CreateIndex
CREATE INDEX "merchant_branches_merchantId_isPrimary_idx" ON "merchant_branches"("merchantId" ASC, "isPrimary" ASC);

-- CreateIndex
CREATE INDEX "merchant_branches_merchantId_status_idx" ON "merchant_branches"("merchantId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "merchant_branches_status_idx" ON "merchant_branches"("status" ASC);

-- CreateIndex
CREATE INDEX "merchant_offers_deletedAt_idx" ON "merchant_offers"("deletedAt" ASC);

-- CreateIndex
CREATE INDEX "merchant_offers_merchantId_idx" ON "merchant_offers"("merchantId" ASC);

-- CreateIndex
CREATE INDEX "merchant_offers_merchantId_status_idx" ON "merchant_offers"("merchantId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "merchant_offers_replacesOfferId_idx" ON "merchant_offers"("replacesOfferId" ASC);

-- CreateIndex
CREATE INDEX "merchant_offers_startDate_endDate_idx" ON "merchant_offers"("startDate" ASC, "endDate" ASC);

-- CreateIndex
CREATE INDEX "merchant_offers_status_idx" ON "merchant_offers"("status" ASC);

-- CreateIndex
CREATE INDEX "merchant_offers_status_startDate_endDate_idx" ON "merchant_offers"("status" ASC, "startDate" ASC, "endDate" ASC);

-- CreateIndex
CREATE INDEX "merchant_profile_edit_requests_merchantId_idx" ON "merchant_profile_edit_requests"("merchantId" ASC);

-- CreateIndex
CREATE INDEX "merchant_status_history_createdAt_idx" ON "merchant_status_history"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "merchant_status_history_merchantId_idx" ON "merchant_status_history"("merchantId" ASC);

-- CreateIndex
CREATE INDEX "merchants_categoryId_idx" ON "merchants"("categoryId" ASC);

-- CreateIndex
CREATE INDEX "merchants_displayPriority_idx" ON "merchants"("displayPriority" ASC);

-- CreateIndex
CREATE INDEX "merchants_isFeatured_idx" ON "merchants"("isFeatured" ASC);

-- CreateIndex
CREATE INDEX "merchants_isHomepageMerchant_idx" ON "merchants"("isHomepageMerchant" ASC);

-- CreateIndex
CREATE INDEX "merchants_slug_idx" ON "merchants"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_slug_key" ON "merchants"("slug" ASC);

-- CreateIndex
CREATE INDEX "merchants_status_categoryId_idx" ON "merchants"("status" ASC, "categoryId" ASC);

-- CreateIndex
CREATE INDEX "merchants_status_deletedAt_idx" ON "merchants"("status" ASC, "deletedAt" ASC);

-- CreateIndex
CREATE INDEX "merchants_status_idx" ON "merchants"("status" ASC);

-- CreateIndex
CREATE INDEX "most_popular_merchants_companyId_idx" ON "most_popular_merchants"("companyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "most_popular_merchants_merchantId_companyId_key" ON "most_popular_merchants"("merchantId" ASC, "companyId" ASC);

-- CreateIndex
CREATE INDEX "notification_deliveries_notificationId_channel_idx" ON "notification_deliveries"("notificationId" ASC, "channel" ASC);

-- CreateIndex
CREATE INDEX "notification_deliveries_notificationId_idx" ON "notification_deliveries"("notificationId" ASC);

-- CreateIndex
CREATE INDEX "notification_events_adminId_idx" ON "notification_events"("adminId" ASC);

-- CreateIndex
CREATE INDEX "notification_events_companyAdminId_idx" ON "notification_events"("companyAdminId" ASC);

-- CreateIndex
CREATE INDEX "notification_events_createdAt_idx" ON "notification_events"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "notification_events_employeeId_idx" ON "notification_events"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "notification_events_merchantId_idx" ON "notification_events"("merchantId" ASC);

-- CreateIndex
CREATE INDEX "notification_events_type_createdAt_idx" ON "notification_events"("type" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "notification_events_type_idx" ON "notification_events"("type" ASC);

-- CreateIndex
CREATE INDEX "notification_preferences_userId_role_idx" ON "notification_preferences"("userId" ASC, "role" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_role_notificationType_key" ON "notification_preferences"("userId" ASC, "role" ASC, "notificationType" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "offer_analytics_offerId_key" ON "offer_analytics"("offerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "offer_content_offerId_key" ON "offer_content"("offerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "offer_pricing_offerId_key" ON "offer_pricing"("offerId" ASC);

-- CreateIndex
CREATE INDEX "offer_redemption_attempts_employeeId_idx" ON "offer_redemption_attempts"("employeeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "offer_redemption_attempts_offerId_employeeId_key" ON "offer_redemption_attempts"("offerId" ASC, "employeeId" ASC);

-- CreateIndex
CREATE INDEX "offer_redemption_attempts_offerId_idx" ON "offer_redemption_attempts"("offerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "offer_redemption_attempts_redemptionId_key" ON "offer_redemption_attempts"("redemptionId" ASC);

-- CreateIndex
CREATE INDEX "offer_redemption_capacity_offerId_idx" ON "offer_redemption_capacity"("offerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "offer_redemption_capacity_offerId_key" ON "offer_redemption_capacity"("offerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "offer_redemptions_offerId_key" ON "offer_redemptions"("offerId" ASC);

-- CreateIndex
CREATE INDEX "offer_replacement_requests_currentOfferId_idx" ON "offer_replacement_requests"("currentOfferId" ASC);

-- CreateIndex
CREATE INDEX "offer_replacement_requests_newOfferId_idx" ON "offer_replacement_requests"("newOfferId" ASC);

-- CreateIndex
CREATE INDEX "offer_replacement_requests_status_idx" ON "offer_replacement_requests"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "offer_reviews_offerId_key" ON "offer_reviews"("offerId" ASC);

-- CreateIndex
CREATE INDEX "offer_views_employeeId_idx" ON "offer_views"("employeeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "offer_views_offerId_employeeId_key" ON "offer_views"("offerId" ASC, "employeeId" ASC);

-- CreateIndex
CREATE INDEX "offer_views_offerId_idx" ON "offer_views"("offerId" ASC);

-- CreateIndex
CREATE INDEX "offer_views_viewedAt_idx" ON "offer_views"("viewedAt" ASC);

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token" ASC);

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_userType_idx" ON "password_reset_tokens"("userId" ASC, "userType" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_key_key" ON "platform_settings"("key" ASC);

-- CreateIndex
CREATE INDEX "realtime_events_channel_idx" ON "realtime_events"("channel" ASC);

-- CreateIndex
CREATE INDEX "realtime_events_createdAt_idx" ON "realtime_events"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "realtime_events_eventType_idx" ON "realtime_events"("eventType" ASC);

-- CreateIndex
CREATE INDEX "realtime_events_idempotencyKey_idx" ON "realtime_events"("idempotencyKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "realtime_events_idempotencyKey_key" ON "realtime_events"("idempotencyKey" ASC);

-- CreateIndex
CREATE INDEX "redemption_analytics_companyId_date_idx" ON "redemption_analytics"("companyId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "redemption_analytics_merchantId_date_idx" ON "redemption_analytics"("merchantId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "redemption_analytics_merchantId_date_key" ON "redemption_analytics"("merchantId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "redemption_analytics_offerId_date_idx" ON "redemption_analytics"("offerId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "redemptions_companyId_idx" ON "redemptions"("companyId" ASC);

-- CreateIndex
CREATE INDEX "redemptions_companyId_redeemedAt_idx" ON "redemptions"("companyId" ASC, "redeemedAt" ASC);

-- CreateIndex
CREATE INDEX "redemptions_employeeId_idx" ON "redemptions"("employeeId" ASC);

-- CreateIndex
CREATE INDEX "redemptions_employeeId_isRedeemed_idx" ON "redemptions"("employeeId" ASC, "isRedeemed" ASC);

-- CreateIndex
CREATE INDEX "redemptions_employeeId_isSaved_idx" ON "redemptions"("employeeId" ASC, "isSaved" ASC);

-- CreateIndex
CREATE INDEX "redemptions_employeeId_loggedSavingAmount_idx" ON "redemptions"("employeeId" ASC, "loggedSavingAmount" ASC);

-- CreateIndex
CREATE INDEX "redemptions_merchantId_idx" ON "redemptions"("merchantId" ASC);

-- CreateIndex
CREATE INDEX "redemptions_merchantId_redeemedAt_discountAmount_savingsAmo_idx" ON "redemptions"("merchantId" ASC, "redeemedAt" ASC, "discountAmount" ASC, "savingsAmount" ASC);

-- CreateIndex
CREATE INDEX "redemptions_merchantId_redeemedAt_idx" ON "redemptions"("merchantId" ASC, "redeemedAt" ASC);

-- CreateIndex
CREATE INDEX "redemptions_offerId_idx" ON "redemptions"("offerId" ASC);

-- CreateIndex
CREATE INDEX "redemptions_offerId_isVerified_idx" ON "redemptions"("offerId" ASC, "isVerified" ASC);

-- CreateIndex
CREATE INDEX "redemptions_offerId_redeemedAt_idx" ON "redemptions"("offerId" ASC, "redeemedAt" ASC);

-- CreateIndex
CREATE INDEX "redemptions_redeemedAt_discountAmount_savingsAmount_idx" ON "redemptions"("redeemedAt" ASC, "discountAmount" ASC, "savingsAmount" ASC);

-- CreateIndex
CREATE INDEX "redemptions_redeemedAt_idx" ON "redemptions"("redeemedAt" ASC);

-- CreateIndex
CREATE INDEX "renewal_gaming_alerts_createdAt_idx" ON "renewal_gaming_alerts"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "renewal_gaming_alerts_employeeId_idx" ON "renewal_gaming_alerts"("employeeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_picks_merchantId_weekStart_key" ON "weekly_picks"("merchantId" ASC, "weekStart" ASC);

-- CreateIndex
CREATE INDEX "weekly_picks_weekStart_weekEnd_idx" ON "weekly_picks"("weekStart" ASC, "weekEnd" ASC);

-- AddForeignKey
ALTER TABLE "MerchantReview" ADD CONSTRAINT "MerchantReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantReview" ADD CONSTRAINT "MerchantReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantReview" ADD CONSTRAINT "MerchantReview_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantReview" ADD CONSTRAINT "MerchantReview_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantReview" ADD CONSTRAINT "MerchantReview_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "redemptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_queue_items" ADD CONSTRAINT "action_queue_items_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_queue_items" ADD CONSTRAINT "action_queue_items_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyAdminId_fkey" FOREIGN KEY ("companyAdminId") REFERENCES "company_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_bookings" ADD CONSTRAINT "banner_bookings_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "banners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_bookings" ADD CONSTRAINT "banner_bookings_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_contents" ADD CONSTRAINT "banner_contents_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "banner_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_admins" ADD CONSTRAINT "company_admins_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_billing" ADD CONSTRAINT "company_billing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_status_history" ADD CONSTRAINT "company_status_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_actions" ADD CONSTRAINT "complaint_actions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_actions" ADD CONSTRAINT "complaint_actions_companyAdminId_fkey" FOREIGN KEY ("companyAdminId") REFERENCES "company_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_actions" ADD CONSTRAINT "complaint_actions_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_actions" ADD CONSTRAINT "complaint_actions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_actions" ADD CONSTRAINT "complaint_actions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_escalations" ADD CONSTRAINT "complaint_escalations_companyAdminId_fkey" FOREIGN KEY ("companyAdminId") REFERENCES "company_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_escalations" ADD CONSTRAINT "complaint_escalations_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_escalations" ADD CONSTRAINT "complaint_escalations_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_rejected_rows" ADD CONSTRAINT "csv_rejected_rows_csvUploadId_fkey" FOREIGN KEY ("csvUploadId") REFERENCES "csv_upload_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_upload_jobs" ADD CONSTRAINT "csv_upload_jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_offer_analytics" ADD CONSTRAINT "daily_offer_analytics_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_addresses" ADD CONSTRAINT "employee_addresses_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("authUserId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero_banners" ADD CONSTRAINT "hero_banners_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_companyAdminId_fkey" FOREIGN KEY ("companyAdminId") REFERENCES "company_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_branches" ADD CONSTRAINT "merchant_branches_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_offers" ADD CONSTRAINT "merchant_offers_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_offers" ADD CONSTRAINT "merchant_offers_replacesOfferId_fkey" FOREIGN KEY ("replacesOfferId") REFERENCES "merchant_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_profile_edit_requests" ADD CONSTRAINT "merchant_profile_edit_requests_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_profile_edit_requests" ADD CONSTRAINT "merchant_profile_edit_requests_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_status_history" ADD CONSTRAINT "merchant_status_history_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("authUserId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "most_popular_merchants" ADD CONSTRAINT "most_popular_merchants_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "most_popular_merchants" ADD CONSTRAINT "most_popular_merchants_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_companyAdminId_fkey" FOREIGN KEY ("companyAdminId") REFERENCES "company_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_analytics" ADD CONSTRAINT "offer_analytics_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_content" ADD CONSTRAINT "offer_content_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_pricing" ADD CONSTRAINT "offer_pricing_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_redemption_attempts" ADD CONSTRAINT "offer_redemption_attempts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_redemption_attempts" ADD CONSTRAINT "offer_redemption_attempts_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_redemption_capacity" ADD CONSTRAINT "offer_redemption_capacity_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_redemptions" ADD CONSTRAINT "offer_redemptions_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_replacement_requests" ADD CONSTRAINT "offer_replacement_requests_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_replacement_requests" ADD CONSTRAINT "offer_replacement_requests_currentOfferId_fkey" FOREIGN KEY ("currentOfferId") REFERENCES "merchant_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_replacement_requests" ADD CONSTRAINT "offer_replacement_requests_newOfferId_fkey" FOREIGN KEY ("newOfferId") REFERENCES "merchant_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_reviews" ADD CONSTRAINT "offer_reviews_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_views" ADD CONSTRAINT "offer_views_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_views" ADD CONSTRAINT "offer_views_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_picks" ADD CONSTRAINT "weekly_picks_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

