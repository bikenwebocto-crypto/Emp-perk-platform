// src/lib/analytics/conversion.ts
export function calcConversionRate(redeemed: number, views: number): number | null {
  if (views <= 0) return null // no views → rate is undefined, not 0 or Infinity
  return Math.round((redeemed / views) * 1000) / 10 // 1 decimal place
}