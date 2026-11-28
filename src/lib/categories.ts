import type { Prisma } from '@prisma/client'

export const MERCHANT_APPLICATION_OTHER_OPTION = 'Other'

export function isOtherCategoryName(name: string | null | undefined): boolean {
  return name?.trim().toLocaleLowerCase() === MERCHANT_APPLICATION_OTHER_OPTION.toLocaleLowerCase()
}

export const selectableCategoryWhere = {
  isActive: true,
  NOT: {
    name: { equals: MERCHANT_APPLICATION_OTHER_OPTION, mode: 'insensitive' },
  },
} satisfies Prisma.CategoryWhereInput
