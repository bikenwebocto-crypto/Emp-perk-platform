import type { RedemptionMerchantEmailData } from '@/emails/types'
import { escapeHtmlContent, renderTemplate } from '@/emails/renderer'

export function renderRedemptionSuccessMerchantTemplate(
  data: RedemptionMerchantEmailData
): string {
  const bodyHtml = `
    <p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hi ${escapeHtmlContent(data.merchantName)},</p>
    <p style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">A reward redemption has been successfully processed.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0; background-color: #F7F7F8; border-radius: 6px;">
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px;">Employee</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-weight: 600; font-size: 14px; text-align: right;">${escapeHtmlContent(data.employeeName)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px;">Company</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-weight: 600; font-size: 14px; text-align: right;">${escapeHtmlContent(data.companyName)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px;">Reward</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-weight: 600; font-size: 14px; text-align: right;">${escapeHtmlContent(data.offerTitle)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px;">Redemption Code</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #61549A; font-family: monospace; font-weight: 700; font-size: 14px; text-align: right;">${escapeHtmlContent(data.redemptionCode)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; color: #6b7280; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 14px;">Redeemed On</td>
        <td style="padding: 12px 16px; color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-weight: 600; font-size: 14px; text-align: right;">${escapeHtmlContent(data.redeemedDate)}</td>
      </tr>
    </table>
    <p style="color: #374151; font-size: 14px; margin: 16px 0 0 0;">This redemption has been recorded successfully.</p>
  `

  return renderTemplate('Reward Redemption Completed', bodyHtml)
}
