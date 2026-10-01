import { z } from 'zod'

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be at most 500 characters')
    .optional()
    .transform((v) => v || undefined),
  logoUrl: z.string().url('Invalid logo URL').optional(),
})
export type CreateCategoryInput = z.infer<typeof createCategorySchema>

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be at most 100 characters').optional(),
    // Empty string or null clears the description.
    description: z
      .string()
      .trim()
      .max(500, 'Description must be at most 500 characters')
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v || null)),
    // A new uploaded URL replaces the logo; null removes it; omitted keeps it.
    logoUrl: z.string().url('Invalid logo URL').nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>

export function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
}
