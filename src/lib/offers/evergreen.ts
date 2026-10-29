export function isEvergreenRange(startDate: Date | string, endDate: Date | string): boolean {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
  const threshold = new Date(start);
  threshold.setFullYear(threshold.getFullYear() + 1);
  return end >= threshold;
}

export function offerRank(o: { evergreen: boolean; isFlash?: boolean | null }): number {
  return o.evergreen ? 0 : o.isFlash ? 1 : 2;
}
