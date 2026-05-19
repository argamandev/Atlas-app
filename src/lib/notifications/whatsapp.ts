export async function sendInsiderWhatsApp({
  to,
  companyName,
  reportUrl,
}: {
  to: string
  companyName: string
  reportUrl: string
}): Promise<void> {
  const instanceId = process.env.GREEN_API_INSTANCE_ID!
  const apiToken = process.env.GREEN_API_TOKEN!

  const message = `חברת ${companyName} פרסמה הודעה מתפרצת בנוגע לעסקת בעלי עניין.\nתקרא פה - ${reportUrl}`

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
