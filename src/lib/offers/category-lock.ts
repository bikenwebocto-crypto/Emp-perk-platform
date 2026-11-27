import { NextResponse } from 'next/server'

/**
 * An offer's category always mirrors the merchant's category. Returns a 400
 * response when the client sends a categoryId that differs from it, else null.
 */
export function categoryLockError(
  requested: unknown,
  merchantCategoryId: string | null | undefined,
): NextResponse | null {
  if (requested === undefined || requested === null || requested === '') return null
  if (requested === merchantCategoryId) return null
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'CATEGORY_LOCKED',
        message: "An offer's category must match your business category and cannot be changed.",
        field: 'categoryId',
      },
    },
    { status: 400 },
  )
}
