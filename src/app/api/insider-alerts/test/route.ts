import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase, supabaseAdmin } from '@/lib/supabase'
import { sendInsiderEmail } from '@/lib/notifications/email'
import { sendInsiderWhatsApp } from '@/lib/notifications/whatsapp'

export const dynamic = 'force-dynamic'

const SAMPLE_COMPANY = 'סנטימנט בדיקה'
const SAMPLE_URL = 'https://maya.tase.co.il/he/reports/companies?isPriority=false&isTradeHalt=false&by=company&eventsFamilyIds[]=900'

type Result = 'sent' | 'failed' | 'skipped'

export async function POST() {
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: prefs } = await supabaseAdmin
    .from('notification_prefs')
    .select('notify_email, notify_whatsapp, email, whatsapp_phone')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!prefs || (!prefs.notify_email && !prefs.notify_whatsapp)) {
    return NextResponse.json(
      { error: 'בחר לפחות שיטת עדכון אחת ושמור הגדרות' },
      { status: 400 }
    )
  }

  let emailResult: Result = 'skipped'
  let whatsappResult: Result = 'skipped'
  const errors: { email?: string; whatsapp?: string } = {}

  if (prefs.notify_email && prefs.email) {
    try {
      await sendInsiderEmail({
        to: prefs.email,
        companyName: SAMPLE_COMPANY,
        reportUrl: SAMPLE_URL,
      })
      emailResult = 'sent'
    } catch (err) {
      emailResult = 'failed'
      errors.email = err instanceof Error ? err.message : 'unknown error'
    }
  }

  if (prefs.notify_whatsapp && prefs.whatsapp_phone) {
    try {
      await sendInsiderWhatsApp({
        to: prefs.whatsapp_phone,
        companyName: SAMPLE_COMPANY,
        reportUrl: SAMPLE_URL,
      })
      whatsappResult = 'sent'
    } catch (err) {
      whatsappResult = 'failed'
      errors.whatsapp = err instanceof Error ? err.message : 'unknown error'
    }
  }

  return NextResponse.json({ email: emailResult, whatsapp: whatsappResult, errors })
}
