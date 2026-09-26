export type QueueTabKey = 'ALL'  | 'OFFER_APPROVAL' | 'COMPANY_ACTIVATION' // | 'ISSUES' | 'ALERTS' // | 'MERCHANT_APPROVAL'

export type EntityKind = 'MERCHANT' | 'MERCHANT_OFFER' | 'COMPANY' | 'ISSUE' | 'CSV' | 'ASSET' | 'RENEWAL_ALERT' | 'UNKNOWN'

export interface QueueTypeMapping {
  displayType: string
  tabCategory: QueueTabKey
  priority: string
  entityKind: EntityKind
  reviewComponent: string
}

export const QUEUE_TYPE_MAP: Record<string, QueueTypeMapping> = {
  // NEW_MERCHANT_APPLICATION: {
  //   displayType: 'Merchant Application',
  //   // tabCategory: 'MERCHANT_APPROVAL',
  //   priority: 'HIGH',
  //   entityKind: 'MERCHANT',
  //   reviewComponent: 'MerchantApplicationReview',
  // },

  FIRST_OFFER_APPROVAL: {
    displayType: 'First Offer Approval',
    tabCategory: 'OFFER_APPROVAL',
    priority: 'HIGH',
    entityKind: 'MERCHANT_OFFER',
    reviewComponent: 'OfferReview',
  },

  OFFER_REPLACEMENT: {
    displayType: 'Offer Replacement',
    tabCategory: 'OFFER_APPROVAL',
    priority: 'MEDIUM',
    entityKind: 'MERCHANT_OFFER',
    reviewComponent: 'OfferReplacementReview',
  },

  // PROFILE_EDIT_REQUEST: {
  //   displayType: 'Profile Change',
  //   // tabCategory: 'MERCHANT_APPROVAL',
  //   priority: 'MEDIUM',
  //   entityKind: 'MERCHANT',
  //   reviewComponent: 'ProfileReview',
  // },

  COMPANY_ACTIVATION: {
    displayType: 'Company Activation',
    tabCategory: 'COMPANY_ACTIVATION',
    priority: 'STANDARD',
    entityKind: 'COMPANY',
    reviewComponent: 'CompanyActivationReview',
  },

  // ISSUE_REVIEW: {
  //   displayType: 'Issue Review',
  //   // tabCategory: 'ISSUES',
  //   priority: 'MEDIUM',
  //   entityKind: 'ISSUE',
  //   reviewComponent: 'IssueReview',
  // },

  // CSV_IMPORT: {
  //   displayType: 'CSV Import',
  //   // tabCategory: 'ISSUES',
  //   priority: 'LOW',
  //   entityKind: 'CSV',
  //   reviewComponent: 'CsvImportReview',
  // },

  // BRANCH_EDIT_REQUEST: {
  //   displayType: 'Branch Edit Request',
  //   // tabCategory: 'MERCHANT_APPROVAL',
  //   priority: 'MEDIUM',
  //   entityKind: 'MERCHANT',
  //   reviewComponent: 'BranchReview',
  // },

  // ASSET_REVIEW: {
  //   displayType: 'Asset Review',
  //   // tabCategory: 'ALERTS',
  //   priority: 'LOW',
  //   entityKind: 'ASSET',
  //   reviewComponent: 'AssetReview',
  // },
};

export const TAB_KEYS: { key: QueueTabKey; label: string; queueTypes: string[] }[] = [
  { key: 'ALL', label: 'All', queueTypes: [] },
  // { key: 'MERCHANT_APPROVAL', label: 'Merchant Applications', queueTypes: ['NEW_MERCHANT_APPLICATION', 'PROFILE_EDIT_REQUEST', 'BRANCH_EDIT_REQUEST'] },
  { key: 'OFFER_APPROVAL', label: 'Offer Approvals', queueTypes: ['FIRST_OFFER_APPROVAL', 'OFFER_REPLACEMENT'] },
  { key: 'COMPANY_ACTIVATION', label: 'Company Activation', queueTypes: ['COMPANY_ACTIVATION'] },
  // { key: 'ISSUES', label: 'Issues', queueTypes: ['ISSUE_REVIEW', 'CSV_IMPORT'] },
  // { key: 'ALERTS', label: 'Alerts', queueTypes: ['ASSET_REVIEW'] },
]

export const PRIORITY_STYLES: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-500',
  MEDIUM: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-500',
  STANDARD: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-500',
  LOW: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-500',
}

export const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500',
  SKIPPED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-500',
}

export function getQueueTypeMapping(queueType?: string | null): QueueTypeMapping | undefined {
  if (!queueType) return undefined
  return QUEUE_TYPE_MAP[queueType]
}

export function getEntityKindFromReferenceType(referenceType?: string | null): EntityKind {
  if (!referenceType) return 'UNKNOWN'
  const normalized = referenceType.toUpperCase().replace(/-/g, '_')
  if (normalized === 'MERCHANT_OFFER' || normalized === 'OFFER') return 'MERCHANT_OFFER'
  if (normalized === 'MERCHANT') return 'MERCHANT'
  if (normalized === 'COMPANY') return 'COMPANY'
  if (normalized === 'ISSUE' || normalized === 'ISSUE_REPORT') return 'ISSUE'
  if (normalized === 'RENEWAL_ALERT' || normalized === 'RENEWAL_GAMING_ALERT') return 'RENEWAL_ALERT'
  return 'UNKNOWN'
}

export function getQueueTypeFromEntityKind(entityKind: EntityKind): string | undefined {
  for (const [key, mapping] of Object.entries(QUEUE_TYPE_MAP)) {
    if (mapping.entityKind === entityKind) return key
  }
  return undefined
}

export function getPriorityLabel(priority: number): string {
  if (priority >= 4) return 'HIGH'
  if (priority >= 3) return 'MEDIUM'
  if (priority >= 2) return 'STANDARD'
  return 'LOW'
}
