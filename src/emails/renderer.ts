function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Shared look for every system email (spec "04 Email flows"): wordmark header,
// plain body, one primary button, company footer. Keep the Supabase dashboard
// templates in step with this file.
const BRAND = '#1E40AF'
const TEXT = '#1F2937'
const MUTED = '#6B7280'
const FONT = "Inter, Arial, Helvetica, sans-serif"
const COMPANY_LINE =
  'P&amp;M PERKS &amp; MORE LTD, 118 Ellados Str., 3041 Limassol, Cyprus · Questions? Reply to this email or write to <a href="mailto:hello@perksandmore.com" style="color:' + MUTED + ';">hello@perksandmore.com</a>.'

export interface LayoutOptions {
  /** Inbox preview text shown after the subject. */
  preheader?: string
  /** "You are receiving this because …" line. */
  audienceNote?: string
  /** Optional heading above the body. Spec emails leave it out. */
  heading?: string
}

export function renderLayout(bodyHtml: string, opts: LayoutOptions = {}): string {
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : ''
  const heading = opts.heading
    ? `<h1 style="margin:0 0 20px;color:${TEXT};font-family:${FONT};font-size:22px;line-height:30px;font-weight:600;">${escapeHtml(opts.heading)}</h1>`
    : ''
  const audience = opts.audienceNote
    ? `<p style="margin:8px 0 0;color:${MUTED};font-family:${FONT};font-size:12px;line-height:18px;">${escapeHtml(opts.audienceNote)}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F4F6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#FFFFFF;border:1px solid #E5E7EB;">
          <tr>
            <td style="padding:24px 32px;background-color:#F8FAFC;border-bottom:1px solid #E5E7EB;">
              <span style="color:${BRAND};font-family:${FONT};font-size:20px;font-weight:700;">perks &bull; more</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:${TEXT};font-family:${FONT};font-size:16px;line-height:26px;">
              ${heading}${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#F8FAFC;border-top:1px solid #E5E7EB;">
              <p style="margin:0;color:${MUTED};font-family:${FONT};font-size:12px;line-height:18px;">${COMPANY_LINE}</p>
              ${audience}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Paragraph. `html` is trusted markup; escape variables before passing them in. */
export function p(html: string): string {
  return `<p style="margin:0 0 18px;">${html}</p>`
}

/** Primary button plus the plain link under it, as in the spec. */
export function button(label: string, href: string, note?: string): string {
  const safeHref = escapeHtml(href)
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 12px;">
  <tr><td style="background-color:${BRAND};border-radius:8px;">
    <a href="${safeHref}" target="_blank" style="display:inline-block;padding:13px 24px;color:#FFFFFF;font-family:${FONT};font-size:16px;font-weight:600;text-decoration:none;">${escapeHtml(label)}</a>
  </td></tr>
</table>
<p style="margin:0 0 20px;font-size:13px;line-height:20px;"><a href="${safeHref}" style="color:${BRAND};word-break:break-all;">${safeHref}</a>${note ? `<br/><span style="color:${BRAND};">${escapeHtml(note)}</span>` : ''}</p>`
}

export const SIGN_OFF = `<p style="margin:8px 0 0;">The Perks &amp; More team</p>`

/**
 * Legacy wrapper used by existing templates: title as a heading, then the body.
 * Now renders in the shared spec layout.
 */
export function renderTemplate(title: string, bodyHtml: string): string {
  return renderLayout(bodyHtml, { heading: title, preheader: title })
}

export function escapeHtmlContent(text: string): string {
  return escapeHtml(text)
}
