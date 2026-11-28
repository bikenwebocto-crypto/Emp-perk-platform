import { isOtherCategoryName } from '@/lib/categories'

export function isValidMerchantLeadCategory(value: string, categoryNames: readonly string[]): boolean {
  if (isOtherCategoryName(value)) return true
  const normalized = value.trim().toLocaleLowerCase()
  return categoryNames.some((name) => name.trim().toLocaleLowerCase() === normalized)
}
