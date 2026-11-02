import { renderTemplate } from '../renderer'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export interface DemoBookingRescheduledData {
  firstName: string
  companyName: string
  reference: string
  /** The old time, already rendered in the requester's timezone. */
  previous: string
  /** The new time, already rendered in the requester's timezone. */
  next: string
  timezone: string
  durationMinutes: number
  meetingLink?: string
}

export function renderDemoBookingRescheduledTemplate(
  data: DemoBookingRescheduledData,
): string {
  const meetingLink = data.meetingLink || process.env.DEMO_MEETING_LINK || ''
  const bodyHtml = `
<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Hello ${escapeHtml(data.firstName)},
</p>

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Your demo for <strong>${escapeHtml(data.companyName)}</strong> has been rescheduled.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0; width: 100%;">
  <tr>
    <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0; vertical-align: top; width: 120px;">Reference:</td>
    <td style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0;">${escapeHtml(data.reference)}</td>
  </tr>
  <tr>
    <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0; vertical-align: top;">Previous time:</td>
    <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0; text-decoration: line-through;">${escapeHtml(data.previous)}</td>
  </tr>
  <tr>
    <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0; vertical-align: top;">New time (Cyprus Time):</td>
    <td style="color: #61549A; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; padding: 6px 0;">${escapeHtml(data.next)}</td>
  </tr>
  <tr>
    <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0; vertical-align: top;">Duration:</td>
    <td style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0;">${data.durationMinutes} minutes (video call)</td>
  </tr>
  <tr>
    <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0; vertical-align: top;">Timezone:</td>
    <td style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0;">${escapeHtml(data.timezone)}</td>
  </tr>
</table>

${meetingLink ? `
<div style="margin: 32px 0; text-align: center;">
  <a href="${escapeHtml(meetingLink)}" style="background-color: #61549A; color: #ffffff; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; display: inline-block;">
    Join Microsoft Teams Meeting
  </a>
</div>
` : ''}

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 24px 0 16px 0;">
  If this new time no longer works for you, simply reply to this email at <a href="mailto:hello@perksandmore.com" style="color: #61549A;">hello@perksandmore.com</a> and we will find another slot for you.
</p>

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 32px 0 0 0;">
  Best regards,<br/>
  <strong>The Perks &amp; More Team</strong>
</p>`

  return renderTemplate('Your demo has been rescheduled', bodyHtml)
}
