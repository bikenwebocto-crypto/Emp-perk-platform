import { renderTemplate } from '../renderer'

export interface DemoBookingStatusData {
  firstName: string
  companyName: string
  reference: string
  /** The meeting time, already rendered in the requester's timezone. */
  when: string
  timezone: string
  durationMinutes: number
}

function detailsTable(rows: Array<[string, string, boolean?]>): string {
  const cells = rows
    .map(
      ([label, value, strong]) => `
  <tr>
    <td style="color: #6b7280; font-size: 14px; padding: 4px 12px 4px 0; vertical-align: top;">${label}:</td>
    <td style="color: ${strong ? '#16a34a' : '#374151'}; font-size: 14px; padding: 4px 0;${strong ? ' font-weight: 600;' : ''}">${value}</td>
  </tr>`,
    )
    .join('')

  return `<table style="margin: 0 0 16px 0;">${cells}</table>`
}

export function renderDemoBookingConfirmedTemplate(data: DemoBookingStatusData): string {
  const bodyHtml = `
<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Hello ${data.firstName},
</p>

<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Your ${data.durationMinutes}-minute demo for ${data.companyName} is confirmed.
</p>

${detailsTable([
  ['Reference', data.reference],
  ['When', data.when, true],
  ['Timezone', data.timezone],
  ['Meeting', `Video call (${data.durationMinutes} minutes)`],
])}

<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  We will send you the video-call link before the meeting starts. If you need to change the time, just reply to this email.
</p>

<p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 0;">
  Support: <a href="mailto:${process.env.SUPPORT_EMAIL || 'support@example.com'}" style="color: #16a34a;">${process.env.SUPPORT_EMAIL || 'support@example.com'}</a>
</p>`

  return renderTemplate('Your demo is confirmed', bodyHtml)
}

export function renderDemoBookingCancelledTemplate(data: DemoBookingStatusData): string {
  const bodyHtml = `
<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Hello ${data.firstName},
</p>

<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Your demo for ${data.companyName} has been cancelled, so the time below is no longer held for you.
</p>

${detailsTable([
  ['Reference', data.reference],
  ['Was scheduled for', data.when],
  ['Timezone', data.timezone],
])}

<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  We are sorry we could not make this time work. Reply to this email and we will gladly find another slot for you.
</p>

<p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 0;">
  Support: <a href="mailto:${process.env.SUPPORT_EMAIL || 'support@example.com'}" style="color: #16a34a;">${process.env.SUPPORT_EMAIL || 'support@example.com'}</a>
</p>`

  return renderTemplate('Your demo has been cancelled', bodyHtml)
}
