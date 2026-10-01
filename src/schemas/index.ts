import { z } from 'zod';

// ============================================================
// COMMON SCHEMAS
// ============================================================

const uuidSchema = z.string().uuid();

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const emailSchema = z.string().email('Invalid email address').max(255);

const phoneSchema = z.string().regex(/^\+?[\d\s\-()]{7,20}$/, 'Invalid phone number').optional();

const urlSchema = z.string().url('Invalid URL').max(500).optional().nullable();

const slugSchema = z
  .string()
  .min(2)
  .max(255)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens only');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ============================================================
// AUTH SCHEMAS
// ============================================================

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  userType: z.enum(['admin', 'merchant', 'company_admin', 'employee']),
});

export const loginWithRoleSchema = loginSchema.extend({
  rememberMe: z.boolean().default(false),
});

export const registerAdminSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN', 'CONTENT_ADMIN']).default('SUPPORT_ADMIN'),
});

export const registerMerchantSchema = z.object({
  businessName: z.string().min(2, 'Business name is required').max(255),
  email: emailSchema,
  password: passwordSchema,
  contactName: z.string().min(1).max(255),
  contactPhone: phoneSchema,
  categoryId: uuidSchema.optional(),
  description: z.string().max(5000).optional(),
  website: urlSchema,
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(1).max(100),
  agreeToTerms: z.literal(true, { errorMap: () => ({ message: 'You must agree to the terms' }) }),
});

export const registerCompanySchema = z.object({
  name: z.string().min(2, 'Company name is required').max(255),
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: phoneSchema,
  website: urlSchema,
  employeeCount: z.coerce.number().int().min(1).max(100000),
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(1).max(100),
  taxId: z.string().max(50).optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  userType: z.enum(['admin', 'merchant', 'company_admin', 'employee']),
});

// ============================================================
// MERCHANT SCHEMAS
// ============================================================

export const merchantApplicationSchema = registerMerchantSchema;

export const merchantProfileUpdateSchema = z.object({
  businessName: z.string().min(2).max(255).optional(),
  description: z.string().max(5000).optional(),
  website: urlSchema,
  contactPhone: phoneSchema,
  addressLine1: z.string().min(1).max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().min(1).max(20).optional(),
  country: z.string().min(1).max(100).optional(),
  socialLinks: z.object({
    instagram: z.string().url().optional().nullable(),
    facebook: z.string().url().optional().nullable(),
    twitter: z.string().url().optional().nullable(),
    tiktok: z.string().url().optional().nullable(),
  }).optional(),
  businessHours: z.record(z.object({
    open: z.string().regex(/^\d{2}:\d{2}$/),
    close: z.string().regex(/^\d{2}:\d{2}$/),
    isClosed: z.boolean().default(false),
  })).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

export const offerSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(255),
  description: z.string().min(20, 'Description must be at least 20 characters').max(5000),
  shortDescription: z.string().max(500).optional(),
  termsAndConditions: z.string().max(10000).optional(),
  offerType: z.enum(['percentage', 'fixed_amount', 'buy_x_get_y', 'flat_rate']),
  discountValue: z.coerce.number().positive('Discount value must be positive').max(999999.99),
  discountMax: z.coerce.number().positive().max(999999.99).optional().nullable(),
  discountPercent: z.coerce.number().int().min(1).max(100).optional().nullable(),
  minimumSpend: z.coerce.number().min(0).max(999999.99).optional().nullable(),
  maxRedemptions: z.coerce.number().int().min(0).max(999999).default(0),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  isFeatured: z.boolean().default(false),
  isExclusive: z.boolean().default(false),
  redemptionCode: z.string().max(100).optional().nullable(),
  redemptionInstructions: z.string().max(2000).optional(),
});

export const offerUpdateSchema = offerSchema.partial();

export const branchSchema = z.object({
  name: z.string().min(1).max(255),
  addressLine1: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(1).max(100),
  phone: phoneSchema,
  email: emailSchema.optional(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
});

// ============================================================
// ADMIN SCHEMAS
// ============================================================

export const adminApproveMerchantSchema = z.object({
  merchantId: uuidSchema,
  status: z.enum(['ACTIVE', 'REJECTED']),
  rejectionReason: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
  adminNote: z.string().max(500).optional(),
});

export const adminApproveOfferSchema = z.object({
  offerId: uuidSchema,
  status: z.enum(['LIVE', 'REJECTED']),
  rejectionReason: z.string().max(2000).optional(),
});

export const adminCompanyActionSchema = z.object({
  companyId: uuidSchema,
  status: z.enum(['ACTIVE', 'PAUSED', 'SUSPENDED', 'CANCELLED']),
  reason: z.string().max(2000).optional(),
  adminNote: z.string().max(500).optional(),
});

export const adminEmployeeActionSchema = z.object({
  employeeId: uuidSchema,
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'INELIGIBLE']),
  reason: z.string().max(2000).optional(),
});

export const contentBannerSchema = z.object({
  title: z.string().min(1).max(255),
  subtitle: z.string().max(500).optional(),
  headline: z.string().max(255).optional(),
  subtext: z.string().max(500).optional(),
  discountBadge: z.string().max(50).optional(),
  imageUrl: z.string().url(),
  linkUrl: z.string().url().optional().nullable(),
  linkText: z.string().max(100).optional(),
  merchantId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
  displayOrder: z.coerce.number().int().min(0).default(0),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
});

export const platformSettingsSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.record(z.unknown()),
});

// ============================================================
// COMPANY SCHEMAS
// ============================================================

export const createCompanySchema = registerCompanySchema;

export const updateCompanySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  phone: phoneSchema,
  website: urlSchema,
  employeeCount: z.coerce.number().int().min(1).max(100000).optional(),
  addressLine1: z.string().min(1).max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().min(1).max(20).optional(),
  country: z.string().min(1).max(100).optional(),
  industry: z.string().max(100).optional(),
  approvedDomain: z.string().max(255).optional(),
});

export const inviteEmployeeSchema = z.object({
  email: emailSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  employeeId: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  jobTitle: z.string().max(100).optional(),
  phone: phoneSchema,
  joinMethod: z.string().max(50).optional(),
});

export const inviteEmployeesBulkSchema = z.object({
  employees: z.array(inviteEmployeeSchema).min(1).max(500),
});

// ============================================================
// EMPLOYEE SCHEMAS
// ============================================================

export const employeeProfileUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: phoneSchema,
  employeeId: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  jobTitle: z.string().max(100).optional(),
  joinMethod: z.string().max(50).optional(),
});

// ============================================================
// EMPLOYEE EDIT SCHEMAS (Admin / Company Admin)
// ============================================================

export const adminEmployeeUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: emailSchema.optional(),
  employeeId: z.string().max(100).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  jobTitle: z.string().max(100).optional().nullable(),
  phone: phoneSchema,
  status: z.enum(['ACTIVE', 'INACTIVE', 'INVITED', 'SUSPENDED', 'INELIGIBLE']).optional(),
  avatarUrl: z.string().max(500).optional().nullable(),
});

export const companyEmployeeUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  employeeId: z.string().max(100).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  jobTitle: z.string().max(100).optional().nullable(),
  phone: phoneSchema,
  email: emailSchema.optional(),
  avatarUrl: z.string().max(500).optional().nullable(),
}).strict();

export const issueReportSchema = z.object({
  merchantId: uuidSchema,
  redemptionId: uuidSchema.optional().nullable(),
  title: z.string().min(5).max(255),
  description: z.string().min(20).max(5000),
  category: z.enum(['merchant_issue', 'app_issue', 'offer_issue', 'billing_issue', 'other']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});

// ============================================================
// CSV UPLOAD SCHEMA
// ============================================================

export const csvEmployeeRowSchema = z.object({
  email: emailSchema,
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  employee_id: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  job_title: z.string().max(100).optional(),
  phone: z.string().optional(),
  join_method: z.string().max(50).optional(),
});

export const csvUploadSchema = z.object({
  companyId: uuidSchema,
  fileName: z.string().min(1).max(255),
  fileUrl: z.string().url(),
  fileSize: z.coerce.number().int().positive().max(50 * 1024 * 1024),
});

// ============================================================
// ISSUE REVIEW SCHEMA
// ============================================================

export const issueReviewSchema = z.object({
  issueId: uuidSchema,
  status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'REJECTED']),
  adminNotes: z.string().max(5000).optional(),
});

// ============================================================
// OFFER REPLACEMENT SCHEMA
// ============================================================

export const offerReplacementSchema = z.object({
  currentOfferId: uuidSchema,
  reason: z.string().min(10).max(2000),
  newOffer: offerSchema,
});

export const approveReplacementSchema = z.object({
  requestId: uuidSchema,
  isApproved: z.boolean(),
  adminNotes: z.string().max(2000).optional(),
});

// ============================================================
// INFERRED TYPES
// ============================================================

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterMerchantInput = z.infer<typeof registerMerchantSchema>;
export type RegisterCompanyInput = z.infer<typeof registerCompanySchema>;
export type OfferInput = z.infer<typeof offerSchema>;
export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;
export type IssueReportInput = z.infer<typeof issueReportSchema>;
export type AdminApproveMerchantInput = z.infer<typeof adminApproveMerchantSchema>;
export type AdminApproveOfferInput = z.infer<typeof adminApproveOfferSchema>;
export type CSVEmployeeRow = z.infer<typeof csvEmployeeRowSchema>;
