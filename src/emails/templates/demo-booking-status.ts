import { renderTemplate } from '../renderer'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export interface DemoBookingStatusData {
  firstName: string
  companyName: string
  reference: string
  /** The meeting time, already rendered in the requester's timezone. */
  when: string
  timezone: string
  durationMinutes: number
  meetingLink?: string
}

function detailsTable(rows: Array<[string, string, boolean?]>): string {
  const cells = rows
    .map(
      ([label, value, strong]) => `
  <tr>
    <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0; vertical-align: top; width: 100px;">${escapeHtml(label)}:</td>
    <td style="color: ${strong ? '#61549A' : '#1C181D'}; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0;${strong ? ' font-weight: 600;' : ''}">${value}</td>
  </tr>`,
    )
    .join('')

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0; width: 100%;">${cells}</table>`
}

export function renderDemoBookingConfirmedTemplate(data: DemoBookingStatusData): string {
  const meetingLink = data.meetingLink || process.env.DEMO_MEETING_LINK || ''
  const bodyHtml = `
<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Hello ${escapeHtml(data.firstName)},
</p>

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Great news! Your ${data.durationMinutes}-minute demo for <strong>${escapeHtml(data.companyName)}</strong> is confirmed.
</p>

${detailsTable([
  ['Reference', escapeHtml(data.reference)],
  ['When (Cyprus Time)', escapeHtml(data.when), true],
  ['Timezone', escapeHtml(data.timezone)],
  ['Meeting Type', `Video call (${data.durationMinutes} minutes)`],
])}

${meetingLink ? `
<div style="margin: 32px 0; text-align: center;">
  <a href="${escapeHtml(meetingLink)}" style="background-color: #61549A; color: #ffffff; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; display: inline-block;">
    Join Microsoft Teams Meeting
  </a>
</div>
` : `
<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 24px 0 16px 0;">
  We will send you the video-call link before the meeting starts.
</p>
`}

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 24px 0 16px 0;">
  If you need to change the time or have any questions, just reply to this email at <a href="mailto:hello@perksandmore.com" style="color: #61549A;">hello@perksandmore.com</a>.
</p>

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 32px 0 0 0;">
  We look forward to speaking with you soon!<br/><br/>
  Best regards,<br/>
  <strong>The Perks &amp; More Team</strong>
</p>`

  return renderTemplate('Your demo is confirmed', bodyHtml)
}

export function renderDemoBookingCancelledTemplate(data: DemoBookingStatusData): string {
  const bodyHtml = `
<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Hello ${escapeHtml(data.firstName)},
</p>

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Your demo for <strong>${escapeHtml(data.companyName)}</strong> has been cancelled, so the time below is no longer held for you.
</p>

${detailsTable([
  ['Reference', escapeHtml(data.reference)],
  ['Was scheduled for (Cyprus Time)', escapeHtml(data.when)],
  ['Timezone', escapeHtml(data.timezone)],
])}

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 24px 0 16px 0;">
  We're sorry we couldn't make this time work. We'd be happy to find another slot for you!
</p>

<div style="margin: 32px 0; text-align: center;">
  <a href="https://perksandmore.com/book-a-demo/" style="background-color: #61549A; color: #ffffff; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; display: inline-block;">
    Book Another Demo
  </a>
</div>

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 32px 0 0 0;">
  If you have any questions, just reply to this email at <a href="mailto:hello@perksandmore.com" style="color: #61549A;">hello@perksandmore.com</a>.<br/><br/>
  Best regards,<br/>
  <strong>The Perks &amp; More Team</strong>
</p>`

  return renderTemplate('Your demo has been cancelled', bodyHtml)
}
