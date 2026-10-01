export interface CategoryMerchantPreview {
  id: string
  businessName: string
  logoUrl: string | null
  status: string
  deleted: boolean
}

export interface AdminCategoryRow {
  id: string
  name: string
  slug: string
  description: string | null
  /** Legacy icon name (e.g. "utensils") when no logo has been uploaded. */
  icon: string | null
  logoUrl: string | null
  isActive: boolean
  displayOrder: number
  createdAt: string
  /** Every merchant linked to the category, including soft-deleted ones. */
  merchantCount: number
  merchants: CategoryMerchantPreview[]
}
