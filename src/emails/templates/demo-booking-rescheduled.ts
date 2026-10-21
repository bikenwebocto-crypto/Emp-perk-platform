import { renderTemplate } from '../renderer'

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
}

export function renderDemoBookingRescheduledTemplate(
  data: DemoBookingRescheduledData,
): string {
  const bodyHtml = `
<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Hello ${data.firstName},
</p>

<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Your demo for ${data.companyName} has been rescheduled.
</p>

<table style="margin: 0 0 16px 0;">
  <tr>
    <td style="color: #6b7280; font-size: 14px; padding: 4px 12px 4px 0;">Reference:</td>
    <td style="color: #374151; font-size: 14px; padding: 4px 0;">${data.reference}</td>
  </tr>
  <tr>
    <td style="color: #6b7280; font-size: 14px; padding: 4px 12px 4px 0;">Previous time:</td>
    <td style="color: #374151; font-size: 14px; padding: 4px 0; text-decoration: line-through;">${data.previous}</td>
  </tr>
  <tr>
    <td style="color: #6b7280; font-size: 14px; padding: 4px 12px 4px 0;">New time:</td>
    <td style="color: #16a34a; font-size: 14px; font-weight: 600; padding: 4px 0;">${data.next}</td>
  </tr>
  <tr>
    <td style="color: #6b7280; font-size: 14px; padding: 4px 12px 4px 0;">Duration:</td>
    <td style="color: #374151; font-size: 14px; padding: 4px 0;">${data.durationMinutes} minutes (video call)</td>
  </tr>
  <tr>
    <td style="color: #6b7280; font-size: 14px; padding: 4px 12px 4px 0;">Timezone:</td>
    <td style="color: #374151; font-size: 14px; padding: 4px 0;">${data.timezone}</td>
  </tr>
</table>

<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  If this new time no longer works for you, simply reply to this email and we will find another slot.
</p>

<p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 0;">
  Support: <a href="mailto:${process.env.SUPPORT_EMAIL || 'support@example.com'}" style="color: #16a34a;">${process.env.SUPPORT_EMAIL || 'support@example.com'}</a>
</p>`

  return renderTemplate('Your demo has been rescheduled', bodyHtml)
}
