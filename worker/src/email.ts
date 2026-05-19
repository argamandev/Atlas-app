import { Resend } from 'resend'
import type { ReportDetails } from './maya'

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

function row(label: string, value: string | null | undefined): string {
  if (!value) return ''
  return `
    <tr>
      <td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;">${escapeHtml(label)}</td>
      <td style="padding:4px 0;font-weight:600;">${escapeHtml(value)}</td>
    </tr>`
}

function textLine(label: string, value: string | null | undefined): string {
  if (!value) return ''
  return `${label}: ${value}\n`
}

export async function sendInsiderEmail({
  to,
  companyName,
  reportUrl,
  details,
}: {
  to: string
  companyName: string
  reportUrl: string
  details?: ReportDetails
}): Promise<void> {
  const safeUrl = sanitizeReportUrl(reportUrl)

  const subject = `התראת עסקת בעלי עניין — ${companyName}`

  // Plain-text version
  const text = [
    `📊 עסקת בעלי עניין — ${companyName}`,
    '',
    textLine('מחזיק', details?.holderName),
    textLine('מהות הפעולה', details?.actionType),
    textLine('נייר ערך', details?.securityName ?? companyName),
    textLine('כמות', details?.quantity),
    textLine('שער', details?.price),
    textLine('תאריך ביצוע', details?.actionDate),
    textLine('אחזקה לאחר עסקה', details?.holdingPctAfter),
    '',
    `לדיווח המלא: ${safeUrl}`,
  ].join('')

  // HTML version
  const detailRows = [
    row('מחזיק', details?.holderName),
    row('מהות הפעולה', details?.actionType),
    row('נייר ערך', details?.securityName ?? companyName),
    row('כמות ני"ע', details?.quantity),
    row('שער', details?.price),
    row('תאריך ביצוע', details?.actionDate),
    row('אחזקה לאחר עסקה', details?.holdingPctAfter),
  ].join('')

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:#C04A00;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">📊 עסקת בעלי עניין</h2>
        <p style="margin:4px 0 0;font-size:15px;opacity:.9;">${escapeHtml(companyName)}</p>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
        ${detailRows ? `<table style="border-collapse:collapse;width:100%;">${detailRows}</table>` : '<p>פרטי הדיווח זמינים בקישור למטה.</p>'}
        <div style="margin-top:20px;">
          <a href="${escapeHtml(safeUrl)}"
             style="background:#C04A00;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">
            לדיווח המלא במאיה ←
          </a>
        </div>
      </div>
    </div>`

  await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    text,
    html,
  })
}
