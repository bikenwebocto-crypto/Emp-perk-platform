export function isCompleteCategoryOrder(requestedIds: readonly string[], existingIds: readonly string[]): boolean {
  if (requestedIds.length !== existingIds.length) return false
  const requested = new Set(requestedIds)
  return requested.size === requestedIds.length && existingIds.every((id) => requested.has(id))
}
