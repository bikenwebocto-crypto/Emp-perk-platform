import { renderTemplate } from '../renderer'

export interface CompanyAdminInvitationData {
  firstName: string
  companyName: string
  email: string
  loginUrl: string
}

export function renderCompanyAdminInvitationTemplate(
  data: CompanyAdminInvitationData,
): string {
  const bodyHtml = `
<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Hello ${data.firstName},
</p>

<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  You have been added as a Company Administrator.
</p>

<table style="margin: 0 0 16px 0;">
  <tr>
    <td style="color: #6b7280; font-size: 14px; padding: 4px 12px 4px 0;">Company:</td>
    <td style="color: #374151; font-size: 14px; padding: 4px 0;">${data.companyName}</td>
  </tr>
  <tr>
    <td style="color: #6b7280; font-size: 14px; padding: 4px 12px 4px 0;">Email:</td>
    <td style="color: #374151; font-size: 14px; padding: 4px 0;">${data.email}</td>
  </tr>
  <tr>
    <td style="color: #6b7280; font-size: 14px; padding: 4px 12px 4px 0;">Role:</td>
    <td style="color: #374151; font-size: 14px; padding: 4px 0;">Company Administrator</td>
  </tr>
</table>

<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
  <a href="${data.loginUrl}" style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; font-weight: 600;">Create Your Account</a>
</p>

<p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
  Use the link above to sign up with this email address and set your password. After that, you can sign in to your administrator dashboard.
</p>

<p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin: 0;">
  Support: <a href="mailto:${process.env.SUPPORT_EMAIL || 'support@example.com'}" style="color: #16a34a;">${process.env.SUPPORT_EMAIL || 'support@example.com'}</a>
</p>`

  return renderTemplate('Welcome to the Platform', bodyHtml)
}
