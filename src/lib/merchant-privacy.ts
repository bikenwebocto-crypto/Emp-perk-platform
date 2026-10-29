// Merchants only get a limited view of employees: first name + last initial.

export function maskLastName(lastName: string | null | undefined): string {
  const initial = lastName?.trim().charAt(0)
  return initial ? `${initial.toUpperCase()}.` : ''
}

export function maskEmployeeName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  return `${firstName ?? ''} ${maskLastName(lastName)}`.trim()
}
