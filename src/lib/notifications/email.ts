import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'alerts@yourdomain.co.il'

const SAFE_URL_PREFIX = 'https://maya.tase.co.il/'
const SAFE_URL_FALLBACK = 'https://maya.tase.co.il'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeReportUrl(url: string): string {
  return url.startsWith(SAFE_URL_PREFIX) ? url : SAFE_URL_FALLBACK
}

export async function sendInsiderEmail({
  to,
  companyName,
  reportUrl,
}: {
  to: string
  companyName: string
  reportUrl: string
}): Promise<void> {
  const safeUrl = sanitizeReportUrl(reportUrl)
  const escapedName = escapeHtml(companyName)

  const subject = `התראת עסקת בעלי עניין — ${companyName}`
  const text = `חברת ${companyName} פרסמה הודעה מתפרצת בנוגע לעסקת בעלי עניין.\nתקרא פה - ${safeUrl}`
  const html = `<p>חברת ${escapedName} פרסמה הודעה מתפרצת בנוגע לעסקת בעלי עניין.</p><p><a href="${escapeHtml(safeUrl)}">תקרא פה</a></p>`

  await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    text,
    html,
  })
}
