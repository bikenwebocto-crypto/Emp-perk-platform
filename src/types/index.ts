// ============================================================
// CORE TYPE DEFINITIONS
// ============================================================

import type { Prisma } from '@prisma/client';

// ============================================================
// ENUMS
// ============================================================

export type AccountRole = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'EMPLOYEE' | 'MERCHANT';
export type ProfileType = 'ADMIN' | 'COMPANY' | 'EMPLOYEE' | 'MERCHANT';
export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING';
export type AdminRole = 'SUPER_ADMIN' | 'SUPPORT_ADMIN' | 'FINANCE_ADMIN' | 'CONTENT_ADMIN';
export type MerchantStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'ARCHIVED' | 'REJECTED';
export type MerchantOnboardingStep = 'APPLICATION' | 'DOCUMENTS' | 'AGREEMENT' | 'COMPLETE';
export type CompanyStatus = 'PENDING' | 'APPROVED_PENDING_PAYMENT' | 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'CANCELLED';
export type EmployeeStatus = 'INVITED' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'INELIGIBLE';
export type BillingStatus = 'ACTIVE' | 'INVOICE_OVERDUE' | 'ON_HOLD';
export type OfferStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'LIVE' | 'VALIDATION_IN_PROGRESS' | 'AWAITING_APPROVAL' | 'VALIDATION_FAILED' | 'REJECTED' | 'EXPIRED' | 'REPLACED' | 'ARCHIVED' | 'CHANGES_REQUESTED' | 'REPLACEMENT_PENDING';
export type ReplacementStatus = 'PENDING' | 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CLARIFICATION_REQUESTED';
export type IssueStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED';
export type ActionQueueStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
export type ActionQueueType = 'NEW_MERCHANT_APPLICATION' | 'FIRST_OFFER_APPROVAL' | 'OFFER_REPLACEMENT' | 'PROFILE_EDIT_REQUEST' | 'COMPANY_ACTIVATION' | 'ISSUE_REVIEW' | 'CSV_IMPORT' | 'BRANCH_EDIT_REQUEST' | 'ASSET_REVIEW';
export type CSVUploadStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED';
export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS';
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type UserType = 'admin' | 'merchant' | 'company_admin' | 'employee';
export type CompanyAdminStatus = 'ACTIVE' | 'INACTIVE';

// ============================================================
// COMPANY CONTACT vs COMPANY ADMIN TYPES
// ============================================================
// Company contact information lives on the Company row.
// Company admin login information lives on the CompanyAdmin row.
// These are intentionally separate. The company_email is the
// public/support/billing contact; the company_admin.email is the
// actual login email used to access the Company Dashboard.

export interface CompanyContact {
  id: string
  companyName: string
  companyEmail: string
  phone?: string | null
  website?: string | null
  status: CompanyStatus
  city?: string | null
  country?: string | null
  industry?: string | null
  logoUrl?: string | null
  employeeCount: number
  createdAt: Date
}

export interface CompanyAdminSummary {
  id: string
  companyId: string
  firstName: string
  lastName: string
  email: string
  role: 'OWNER' | 'MEMBER'
  status: CompanyAdminStatus
  isPrimary: boolean
  isActive: boolean
  lastLoginAt: Date | null
  createdAt: Date
}

export interface CompanyWithAdmins extends CompanyContact {
  admins: CompanyAdminSummary[]
  primaryAdmin: CompanyAdminSummary | null
  adminCount: number
  activeAdminCount: number
}
export type RealtimeEventType =
  | 'REDEMPTION_CREATED' | 'REDEMPTION_UPDATED'
  | 'MERCHANT_STATUS_CHANGED' | 'COMPANY_STATUS_CHANGED'
  | 'OFFER_STATUS_CHANGED' | 'ACTION_QUEUE_UPDATED'
  | 'ANALYTICS_UPDATED' | 'ISSUE_REPORTED'
  | 'NOTIFICATION_CREATED' | 'EMPLOYEE_STATUS_CHANGED';

export type BranchType = 'IN_STORE' | 'ONLINE';
export type BranchStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED';
export type BranchDisplayType = 'IN_STORE' | 'ONLINE_DELIVERY' | 'ONLINE_DIGITAL';

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: APIError;
  meta?: APIMeta;
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface APIMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface DateRangeFilter {
  from?: Date | string;
  to?: Date | string;
}

// ============================================================
// AUTH TYPES
// ============================================================

export interface AuthUser {
  id: string;
  email: string;
  userType: UserType;
  role?: AdminRole;
  merchantId?: string;
  companyId?: string;
  name: string;
  isActive: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
  userType: UserType;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface JWTPayload {
  sub: string;
  email: string;
  user_type: UserType;
  account_role?: AccountRole;
  admin_role?: AdminRole;
  merchant_id?: string;
  company_id?: string;
  iat: number;
  exp: number;
}

export interface Session {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

// ============================================================
// DASHBOARD TYPES
// ============================================================

export interface DashboardFilter {
  dateRange: DateRangeFilter;
  merchantId?: string;
  companyId?: string;
  offerId?: string;
  status?: string;
  search?: string;
}

export interface AnalyticsSummary {
  totalRedemptions: number;
  totalDiscount: number;
  /** Sum of Redemption.savingsAmount over redeemed rows (EUR). */
  totalSavings: number;
  activeMerchants: number;
  activeCompanies: number;
  activeOffers: number;
  pendingActions: number;
  /** LIVE offers whose end date is still in the future. */
  liveOffers: number;
  /** Offers waiting for an admin decision. */
  pendingOffers: number;
  /** Employees with status ACTIVE. */
  totalEmployees: number;
  /** Employees created since the start of the month (Europe/Nicosia). */
  newEmployeesThisMonth: number;
  /** Distinct active employees with ≥1 redemption in the last 30 days. */
  activeEmployees: number;
  /** activeEmployees / totalEmployees × 100, 1 decimal; null when there are no employees. */
  engagementRate: number | null;
  /** Redemptions since the start of the month (Europe/Nicosia). */
  redemptionsThisMonth: number;
  /** % change vs the previous calendar month, 1 decimal; null when last month had none. */
  redemptionsTrend: number | null;
  avgSavingsPerRedemption: number | null;
  /** Last-30-day redemptions per active employee, 1 decimal. */
  avgRedemptionsPerActiveEmployee: number | null;
  pausedMerchants: number;
  periodComparison?: {
    redemptionsChange: number;
    discountChange: number;
    savingsChange: number;
  };
}

export interface RedemptionChartData {
  date: string;
  count: number;
  discount: number;
  savings: number;
}

export interface TopMerchantData {
  id: string;
  businessName: string;
  logoUrl: string | null;
  totalRedemptions: number;
  totalSavings: number;
  averageRating: number;
}

// ============================================================
// REALTIME EVENT TYPES
// ============================================================

export interface RealtimePayload<T = unknown> {
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  id: string;
  type?: string;
  status?: string;
  payload: T;
  timestamp: string;
}

export interface RedemptionRealtimeEvent {
  id: string;
  merchantId: string;
  offerId: string;
  employeeId: string;
  companyId: string;
  discountAmount: number;
  redeemedAt: string;
}

export interface ActionQueueRealtimeEvent {
  id: string;
  type: ActionQueueType;
  status: ActionQueueStatus;
  title: string;
}

export interface MerchantStatusRealtimeEvent {
  merchantId: string;
  oldStatus: MerchantStatus;
  newStatus: MerchantStatus;
}

export interface OfferStatusRealtimeEvent {
  offerId: string;
  merchantId: string;
  oldStatus: OfferStatus;
  newStatus: OfferStatus;
}

export interface RealtimeChannelConfig {
  channel: string;
  event: string;
  filter?: string;
}

// ============================================================
// BUSINESS LOGIC TYPES
// ============================================================

export interface OfferWithMerchant {
  id: string;
  title: string;
  description: string;
  shortDescription: string | null;
  imageUrls: string[];
  offerType: string;
  discountValue: number;
  discountMax: number | null;
  discountPercent: number | null;
  minimumSpend: number | null;
  startDate: Date;
  endDate: Date;
  status: OfferStatus;
  redemptionCode: string | null;
  merchant: {
    id: string;
    businessName: string;
    slug: string;
    logoUrl: string | null;
    city: string | null;
    state: string | null;
    averageRating: number;
    categoryId: string | null;
  };
}

export interface RedemptionWithDetails {
  id: string;
  redemptionCode: string | null;
  discountAmount: number;
  spentAmount: number | null;
  savingsAmount: number;
  redeemedAt: Date;
  merchant: {
    id: string;
    businessName: string;
    logoUrl: string | null;
  };
  offer: {
    id: string;
    title: string;
    offerType: string;
  };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  branch?: {
    id: string;
    name: string;
    city: string;
  } | null;
}

export interface CSVUploadResult {
  jobId: string;
  successCount: number;
  errorCount: number;
  totalRows: number;
  rejectedRows: Array<{
    row: number;
    reason: string;
  }>;
}

export interface ActionQueueItemWithRef {
  id: string;
  type: ActionQueueType;
  title: string;
  description: string | null;
  referenceId: string;
  referenceType: string;
  status: ActionQueueStatus;
  priority: number;
  createdAt: Date;
  merchant?: {
    id: string;
    businessName: string;
    email: string;
  } | null;
}

// ============================================================
// NOTIFICATION TYPES
// ============================================================

export interface Notification {
  id: string;
  title: string;
  body: string | null;
  channel: NotificationChannel;
  priority: NotificationPriority;
  referenceType: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: Date;
}

// ============================================================
// FILE UPLOAD TYPES
// ============================================================

export interface UploadConfig {
  bucket: string;
  path: string;
  maxSizeBytes: number;
  allowedMimeTypes: string[];
  isPublic: boolean;
}

export interface UploadResult {
  url: string;
  path: string;
  size: number;
  mimeType: string;
}

export const UPLOAD_CONFIGS: Record<string, UploadConfig> = {
  merchantLogo: {
    bucket: 'merchant-logos',
    path: '{merchantId}/logo',
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    isPublic: true,
  },
  offerImage: {
    bucket: 'offer-images',
    path: '{merchantId}/offers/{offerId}',
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp', 'image/gif'],
    isPublic: true,
  },
  heroBanner: {
    bucket: 'hero-banners',
    path: '{bannerId}',
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    isPublic: true,
  },
  csvUpload: {
    bucket: 'csv-uploads',
    path: '{companyId}/{jobId}',
    maxSizeBytes: 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: ['text/csv', 'application/vnd.ms-excel'],
    isPublic: false,
  },
};

// ============================================================
// WEBHOOK TYPES
// ============================================================

export interface WebhookEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface StripeWebhookPayload {
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

// ============================================================
// FILTER PROPS FOR COMPONENTS
// ============================================================

export interface SelectOption {
  label: string;
  value: string;
}

export interface TableSortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
}

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  filterable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render?: (item: T) => React.ReactNode;
}

// ============================================================================
// MERCHANT OPERATIONS DASHBOARD
// ============================================================================

export type MerchantHealth = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export interface MerchantOfferStats {
  live: number;
  pending: number;
  archived: number;
  rejected: number;
  draft: number;
  total: number;
}

export interface MerchantEngagement {
  views: number;
  saved: number;
  redeemed: number;
  conversion: number | null;
}

export interface MerchantRelations {
  companies: number;
  employees: number;
  branches: number;
  issueReports: number;
  openIssues: number;
}

export interface MerchantDashboardRow {
  id: string;
  businessName: string;
  slug: string;
  email: string | null;
  contactName: string;
  contactPhone: string | null;
  logoUrl: string | null;
  city: string | null;
  state: string | null;
  category: { id: string; name: string; slug: string } | null;
  status: MerchantStatus;
  isFeatured: boolean;
  isHomepageMerchant: boolean;
  isTopRated: boolean;
  displayPriority: number;
  averageRating: number;
  totalRedemptions: number;
  createdAt: string;
  updatedAt: string;
  liveAt: string | null;
  lastActivityAt: string | null;
  stats: MerchantOfferStats;
  engagement: MerchantEngagement;
  relations: MerchantRelations;
  health: MerchantHealth;
}

export interface MerchantDashboardSummary {
  totalMerchants: number;
  pendingApproval: number;
  featured: number;
  homepageMerchants: number;
  liveOffers: number;
  pendingOffers: number;
  todaysRedemptions: number;
  thisMonthRedemptions: number;
}

export interface MerchantDashboardResponse {
  success: true;
  data: MerchantDashboardRow[];
  summary: MerchantDashboardSummary;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface MerchantDashboardFilters {
  status?: MerchantStatus | 'ALL';
  categoryId?: string;
  city?: string;
  featured?: boolean;
  homepage?: boolean;
  priorityMin?: number;
  health?: MerchantHealth | 'ALL';
  hasLiveOffers?: boolean;
  hasPendingOffers?: boolean;
  q?: string;
  sortBy?: 'priority' | 'createdAt' | 'status' | 'redemptions' | 'views' | 'lastActivity';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

// ============================================================================
// MERCHANT ANALYTICS (admin/analytics/merchants)
// ============================================================================

export interface MerchantAnalyticsStats {
  totalOffers: number;
  liveOffers: number;
  draftOffers: number;
  pendingOffers: number;
  rejectedOffers: number;
  expiredOffers: number;
  totalViews: number;
  totalSaves: number;
  totalClicks: number;
  totalRedemptions: number;
  conversionRate: number | null;
  averageSavings: number;
  lastOfferCreated: string | null;
}

export interface MerchantAnalyticsRow {
  id: string;
  businessName: string;
  logoUrl: string | null;
  status: MerchantStatus;
  category: { id: string; name: string; slug: string } | null;
  city: string | null;
  statistics: MerchantAnalyticsStats;
}

export type MerchantAnalyticsSortBy =
  | 'redemptions'
  | 'offers'
  | 'views'
  | 'saves'
  | 'recent'
  | 'alphabetical';

export interface MerchantAnalyticsFilters {
  q?: string;
  status?: MerchantStatus | 'ALL';
  categoryId?: string;
  sortBy?: MerchantAnalyticsSortBy;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface MerchantAnalyticsPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface MerchantAnalyticsResponse {
  success: true;
  data: {
    merchants: MerchantAnalyticsRow[];
    pagination: MerchantAnalyticsPagination;
  };
}

// ============================================================================
// MERCHANT ANALYTICS DETAIL (admin/analytics/merchants/[merchantId])
// ============================================================================

export interface MerchantAnalyticsOverview {
  totalOffers: number;
  liveOffers: number;
  draftOffers: number;
  pendingOffers: number;
  rejectedOffers: number;
  expiredOffers: number;
  views: number;
  saves: number;
  clicks: number;
  redemptions: number;
  conversionRate: number | null;
  averageDiscount: number;
  averageSavings: number;
}

export interface MerchantOfferPerformance {
  id: string;
  title: string;
  status: string;
  views: number;
  saves: number;
  clicks: number;
  redemptions: number;
  conversionRate: number | null;
}

export interface ChartSlice {
  label: string;
  value: number;
  color?: string;
}

export interface MerchantChartData {
  statusDistribution: ChartSlice[];
  categoryDistribution: ChartSlice[];
  dailyTrend: Array<{ date: string; redemptions: number; views: number; savings: number }>;
  funnel: ChartSlice[];
}

export interface MerchantAnalyticsDetailResponse {
  success: true;
  data: {
    merchant: {
      id: string;
      businessName: string;
      slug: string;
      logoUrl: string | null;
      status: MerchantStatus;
      isFeatured: boolean;
      isHomepageMerchant: boolean;
      displayPriority: number;
      averageRating: number;
      city: string | null;
      state: string | null;
      country: string | null;
      category: { id: string; name: string; slug: string } | null;
      createdAt: string;
      liveAt: string | null;
      totalRedemptions: number;
    };
    summary: {
      totalOffers: number;
      liveOffers: number;
      draftOffers: number;
      pendingOffers: number;
      rejectedOffers: number;
      expiredOffers: number;
      views: number;
      saves: number;
      clicks: number;
      redemptions: number;
      conversionRate: number | null;
      averageDiscount: number;
      averageSavings: number;
    };
    offerPerformance: MerchantOfferPerformance[];
    charts: MerchantChartData;
  };
}

// ============================================================================
// COMPANY ANALYTICS (admin/analytics/companies)
// ============================================================================

export interface CompanyTopCategory {
  categoryId: string | null;
  categoryName: string;
  redemptions: number;
}

export interface CompanyAnalyticsStats {
  activeEmployees: number;
  inactiveEmployees: number;
  neverLoggedIn: number;
  offersViewed: number;
  offersSaved: number;
  offersClicked: number;
  offersRedeemed: number;
  averageSavings: number;
  monthlySavings: number;
  topCategory: CompanyTopCategory | null;
}

export interface CompanyAnalyticsRow {
  id: string;
  name: string;
  logo: string | null;
  status: string;
  employeeCount: number;
  statistics: CompanyAnalyticsStats;
}

export interface CompanyAnalyticsFilters {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'name' | 'redemptions' | 'savings' | 'employees';
  sortDir?: 'asc' | 'desc';
}

export interface CompanyAnalyticsPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface CompanyAnalyticsResponse {
  success: true;
  data: CompanyAnalyticsRow[];
  pagination: CompanyAnalyticsPagination;
}

// ============================================================================
// COMPANY ANALYTICS DETAIL (admin/analytics/companies/[companyId])
// ============================================================================

export interface CompanyAnalyticsOverviewStats {
  employees: number;
  active: number;
  inactive: number;
  neverLoggedIn: number;
  views: number;
  saves: number;
  clicks: number;
  redeemed: number;
  averageSaving: number;
  topCategory: CompanyTopCategory | null;
}

export interface CompanyActiveEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  avatarUrl: string | null;
  status: string;
  redemptions: number;
  totalSavings: number;
  lastActive: string | null;
}

export interface CompanyUsedMerchant {
  id: string;
  businessName: string;
  logoUrl: string | null;
  category: { id: string; name: string; slug: string } | null;
  redemptions: number;
  totalSavings: number;
  totalSpent: number;
  uniqueEmployees: number;
  lastRedeemedAt: string | null;
}

export interface CompanyAnalyticsDetailCharts {
  categoryPie: ChartSlice[];
  merchantPie: ChartSlice[];
  dailyRedemptionLine: Array<{ date: string; redemptions: number; savings: number }>;
  employeeFunnel: ChartSlice[];
}

export interface CompanyAnalyticsDetailResponse {
  success: true;
  data: {
    company: {
      id: string;
      name: string;
      slug: string;
      email: string;
      logo: string | null;
      status: string;
      employeeCount: number;
      city: string | null;
      state: string | null;
      country: string | null;
      industry: string | null;
      createdAt: string;
      approvedAt: string | null;
    };
    overview: CompanyAnalyticsOverviewStats;
    mostActiveEmployees: CompanyActiveEmployee[];
    mostUsedMerchants: CompanyUsedMerchant[];
    charts: CompanyAnalyticsDetailCharts;
  };
}
