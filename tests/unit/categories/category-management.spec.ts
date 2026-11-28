import { describe, expect, it } from 'vitest'
import { isCompleteCategoryOrder } from '@/features/categories/order'
import { createCategorySchema } from '@/features/categories/schemas'

describe('category management', () => {
  it('accepts complete permutations and rejects missing, duplicate, or foreign IDs', () => {
    expect(isCompleteCategoryOrder(['b', 'a'], ['a', 'b'])).toBe(true)
    expect(isCompleteCategoryOrder(['a'], ['a', 'b'])).toBe(false)
    expect(isCompleteCategoryOrder(['a', 'a'], ['a', 'b'])).toBe(false)
    expect(isCompleteCategoryOrder(['a', 'c'], ['a', 'b'])).toBe(false)
  })

  it('reserves Other for the public merchant application', () => {
    expect(createCategorySchema.safeParse({ name: 'Other' }).success).toBe(false)
    expect(createCategorySchema.safeParse({ name: 'other' }).success).toBe(false)
    expect(createCategorySchema.safeParse({ name: 'Food & Drinks' }).success).toBe(true)
  })
})
