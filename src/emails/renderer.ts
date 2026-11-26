function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderTemplate(title: string, bodyHtml: string): string {
  const safeTitle = escapeHtml(title)
  const logoUrl = escapeHtml(process.env.EMAIL_LOGO_URL || 'https://perksandmore.com/logo.png')
  const privacyPolicyUrl = escapeHtml(process.env.PRIVACY_POLICY_URL || 'https://perksandmore.com/privacy-policy')
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>
<body style="font-family: 'Geologica', Arial, Helvetica, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; max-width: 600px;">
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; background-color: #ffffff; border-bottom: 3px solid #61549A;">
              <img src="${logoUrl}" width="180" alt="Perks & More" style="display: block; width: 180px; max-width: 100%; height: auto; margin: 0 auto; border: 0;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 16px 32px; text-align: center;">
              <h1 style="color: #1C181D; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 24px; font-weight: 600; margin: 0; line-height: 1.3;">${safeTitle}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 32px; background-color: #1C181D; text-align: center;">
              <p style="color: #60A5FA; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 18px; margin: 0 0 12px 0; font-weight: 600;">Perks &amp; More</p>
              <p style="color: #C9E645; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 12px; margin: 0 0 16px 0;">
                <a href="${privacyPolicyUrl}" style="color: #C9E645; text-decoration: underline;">Privacy Policy</a>
              </p>
              <p style="color: #a1a1aa; font-family: 'Geologica', Arial, Helvetica, sans-serif; font-size: 11px; margin: 0; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} Perks &amp; More. All rights reserved.<br/>
                This email was sent from hello@perksandmore.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function escapeHtmlContent(text: string): string {
  return escapeHtml(text)
}
