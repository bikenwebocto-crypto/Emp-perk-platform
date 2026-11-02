import { renderTemplate } from '../renderer'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export interface DemoBookingReceivedData {
  firstName: string
  companyName: string
  reference: string
  /** The meeting time, already rendered in the requester's timezone. */
  when: string
  timezone: string
  durationMinutes: number
  meetingLink?: string
}

export function renderDemoBookingReceivedTemplate(data: DemoBookingReceivedData): string {
  const meetingLink = data.meetingLink || process.env.DEMO_MEETING_LINK || ''
  
  const bodyHtml = `
<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Hello ${escapeHtml(data.firstName)},
</p>

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Thank you for booking a demo with Perks &amp; More! We've received your demo request for <strong>${escapeHtml(data.companyName)}</strong>.
</p>

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
  Your request is currently <strong style="color: #61549A;">pending confirmation</strong>. We'll review and confirm your booking shortly.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0; width: 100%; background-color: #f9fafb; border-radius: 6px;">
  <tr>
    <td style="padding: 20px;">
      <p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 600; margin: 0 0 16px 0;">Booking Details</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
        <tr>
          <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0; vertical-align: top; width: 110px;">Reference:</td>
          <td style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0; font-weight: 600;">${escapeHtml(data.reference)}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0; vertical-align: top;">Requested Time:</td>
          <td style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0;">${escapeHtml(data.when)}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0; vertical-align: top;">Timezone:</td>
          <td style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0;">${escapeHtml(data.timezone)}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 12px 6px 0; vertical-align: top;">Duration:</td>
          <td style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; padding: 6px 0;">${data.durationMinutes} minutes (Video call)</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 24px 0 16px 0;">
  Once your booking is confirmed, we'll send you a confirmation email with the meeting details.
</p>

${meetingLink ? `
<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; margin: 16px 0 24px 0; padding: 12px; background-color: #f0f9ff; border-left: 3px solid #61549A; border-radius: 4px;">
  <strong>Meeting Platform:</strong> Microsoft Teams<br/>
  <span style="color: #6b7280;">The join link will be provided in your confirmation email.</span>
</p>
` : ''}

<p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 32px 0 0 0;">
  If you have any questions in the meantime, please don't hesitate to reach out to us at <a href="mailto:hello@perksandmore.com" style="color: #61549A;">hello@perksandmore.com</a>.<br/><br/>
  Best regards,<br/>
  <strong>The Perks &amp; More Team</strong>
</p>`

  return renderTemplate('Demo Booking Received', bodyHtml)
}