import { escapeHtmlContent, renderTemplate } from '@/emails/renderer'

interface OfferApprovedData {
  merchantName: string
  offerTitle: string
  approvedDate: string
}

export function renderOfferApprovedTemplate(data: OfferApprovedData): string {
  const bodyHtml = `
    <p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hi ${escapeHtmlContent(data.merchantName)},</p>
    <p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">Your offer has been approved and is now live.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0; background-color: #F7F7F8; border-radius: 6px;">
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px;">Offer</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-weight: 600; font-size: 14px; text-align: right;">${escapeHtmlContent(data.offerTitle)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px;">Approved On</td>
        <td style="padding: 12px 16px; color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-weight: 600; font-size: 14px; text-align: right;">${escapeHtmlContent(data.approvedDate)}</td>
      </tr>
    </table>
    <p style="color: #374151; font-size: 14px; margin: 16px 0 0 0;">Employees can now claim and redeem this offer.</p>
  `

  return renderTemplate('Offer Approved', bodyHtml)
}
