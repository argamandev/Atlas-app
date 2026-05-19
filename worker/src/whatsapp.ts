import type { ReportDetails } from './maya'

function line(label: string, value: string | null | undefined): string {
  if (!value) return ''
  return `*${label}:* ${value}\n`
}

export async function sendInsiderWhatsApp({
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
  const instanceId = process.env.GREEN_API_INSTANCE_ID!
  const apiToken = process.env.GREEN_API_TOKEN!

  const message = [
    `📊 *עסקת בעלי עניין — ${companyName}*`,
    '',
    line('מחזיק', details?.holderName),
    line('מהות הפעולה', details?.actionType),
    line('נייר ערך', details?.securityName ?? companyName),
    line('כמות ני"ע', details?.quantity),
    line('שער', details?.price),
    line('תאריך ביצוע', details?.actionDate),
    line('אחזקה לאחר עסקה', details?.holdingPctAfter),
    '',
    `🔗 לדיווח המלא:\n${reportUrl}`,
  ].join('')

  // Strip leading '+', then remove a leading zero after country code 972
  let digits = to.startsWith('+') ? to.slice(1) : to
  if (digits.startsWith('9720')) {
    digits = '972' + digits.slice(4)
  }
  const chatId = `${digits}@c.us`

  const response = await fetch(
    `https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message }),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Green API error ${response.status}: ${text}`)
  }
}
