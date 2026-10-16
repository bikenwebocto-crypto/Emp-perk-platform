'use client'

import { Info } from 'lucide-react'

/**
 * Shared wording for employee ⇄ company admin actions, so every page explains
 * the same consequences the same way. Each builder returns the one-line
 * question for ConfirmDialog's `message`, the concrete effects, and an
 * optional note for the case most likely to surprise the person acting.
 */
export interface ActionCopy {
  message: string
  impacts: string[]
  note?: string
}

export const PROMOTED_BADGE_TOOLTIP =
  'Promoted to Company Admin. Their employee record is kept as history. ' +
  'To change their access, use Company Administrators: Disable, then Revert to Employee.'

export function promoteCopy(params: {
  name: string
  companyName: string
  employeeStatus?: string
}): ActionCopy {
  return {
    message: `Make ${params.name} a Company Admin of ${params.companyName}?`,
    impacts: [
      'They can sign in to the web admin dashboard with their existing password.',
      'They can no longer use the mobile app as an employee. Their savings history is kept.',
      'Their employee record is set to inactive and can no longer be activated from employee lists.',
      'They receive an email telling them about their new access.',
    ],
    note:
      params.employeeStatus === 'INACTIVE'
        ? 'This employee is currently deactivated. Promoting them gives them ACTIVE admin access straight away.'
        : 'To undo this later, disable them in Company Administrators, then choose Revert to Employee.',
  }
}

export function revertCopy(name: string): ActionCopy {
  return {
    message: `Revert ${name} to an employee?`,
    impacts: [
      'They lose access to the web admin dashboard.',
      'Their employee record is set to active, and they can use the mobile app again with their existing password.',
      'Their admin record is kept as inactive history. If they are promoted again, it is reused.',
    ],
  }
}

export function disableAdminCopy(params: { name: string; hasEmployeeRecord?: boolean }): ActionCopy {
  return {
    message: `Disable ${params.name}?`,
    impacts: [
      'They can no longer sign in, on the web dashboard or anywhere else. Their login is set to inactive.',
      'Their admin record is kept, and you can reactivate them at any time.',
    ],
    note: params.hasEmployeeRecord
      ? 'They were promoted from an employee. Disabling does NOT give them mobile app access back. To make them an employee again, choose Revert to Employee after disabling.'
      : undefined,
  }
}

export function reactivateAdminCopy(params: { name: string; hasEmployeeRecord?: boolean }): ActionCopy {
  return {
    message: `Reactivate ${params.name} as a Company Admin?`,
    impacts: ['They can sign in to the web admin dashboard again with their existing password.'],
    note: params.hasEmployeeRecord
      ? 'If you want them back as an employee instead, choose Revert to Employee rather than Reactivate.'
      : undefined,
  }
}

export function deactivateEmployeeCopy(name: string): ActionCopy {
  return {
    message: `Deactivate ${name}?`,
    impacts: [
      'They can no longer sign in to the mobile app or redeem offers.',
      'Their savings history is kept, and you can reactivate them at any time.',
    ],
    note: "If they haven't accepted their invite yet, their pending invite is left as it is.",
  }
}

export function reactivateEmployeeCopy(name: string): ActionCopy {
  return {
    message: `Reactivate ${name}?`,
    impacts: ['They can sign in to the mobile app and redeem offers again with their existing password.'],
  }
}

/** The effects list and note rendered inside ConfirmDialog. */
export function ActionImpact({ copy }: { copy: ActionCopy }) {
  return (
    <div className="space-y-3 text-sm">
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        {copy.impacts.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {copy.note && (
        <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{copy.note}</span>
        </p>
      )}
    </div>
  )
}
