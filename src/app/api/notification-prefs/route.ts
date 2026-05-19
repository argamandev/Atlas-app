import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createServerSupabase, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function normalizeIsraeliPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 10) {
    digits = '972' + digits.slice(1)
  } else if (digits.length === 9 && !digits.startsWith('972')) {
    digits = '972' + digits
  }
  if (!/^\d{11,13}$/.test(digits)) return null
  return '+' + digits
}

async function requireSession() {
  const cookieStore = cookies()
  const supabase = createServerSupabase(cookieStore)
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function GET() {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('notification_prefs')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!data) {
    return NextResponse.json({
      notify_email: false,
      notify_whatsapp: false,
      email: null,
      whatsapp_phone: null,
    })
  }

  return NextResponse.json(data)
}

const putSchema = z
  .object({
    email: z.string().nullable().optional(),
    whatsapp_phone: z.string().nullable().optional(),
    notify_email: z.boolean(),
    notify_whatsapp: z.boolean(),
  })
  .superRefine((val, ctx) => {
    if (val.notify_whatsapp) {
      if (!val.whatsapp_phone || !normalizeIsraeliPhone(val.whatsapp_phone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'מספר טלפון לא תקין. הזן מספר ישראלי',
          path: ['whatsapp_phone'],
        })
      }
    }
  })

export async function PUT(req: NextRequest) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const body = await req.json()
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { whatsapp_phone, notify_email, notify_whatsapp } = parsed.data
  const normalizedPhone =
    notify_whatsapp && whatsapp_phone ? normalizeIsraeliPhone(whatsapp_phone) : null

  // H2: Force email to authenticated user's own address — ignore submitted value
  let resolvedEmail: string | null = null
  if (notify_email) {
    if (!session.user.email) {
      return NextResponse.json({ error: 'לא ניתן לאמת כתובת אימייל' }, { status: 400 })
    }
    resolvedEmail = session.user.email
  }

  // H3: TODO — WhatsApp number is stored but not verified via OTP.
  // Risk: a user could set another person's phone number and spam them.
  // Mitigation v1: warn on change and log server-side. Full OTP flow is out of scope.
  let responseWarning: string | undefined

  if (notify_whatsapp && normalizedPhone) {
    const { data: existingPrefs } = await supabaseAdmin
      .from('notification_prefs')
      .select('whatsapp_phone')
      .eq('user_id', userId)
      .maybeSingle()

    const storedPhone = existingPrefs?.whatsapp_phone ?? null
    if (normalizedPhone !== storedPhone) {
      console.warn('[security] whatsapp_phone changed for user:', userId)
      responseWarning = 'מספר הוואטסאפ ישמר אך לא אומת. אנו ממליצים לאמת אותו.'
    }
  }

  const { data, error } = await supabaseAdmin
    .from('notification_prefs')
    .upsert(
      {
        user_id: userId,
        email: resolvedEmail,
        whatsapp_phone: normalizedPhone,
        notify_email,
        notify_whatsapp,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (responseWarning) {
    return NextResponse.json({ ...data, warning: responseWarning })
  }
  return NextResponse.json(data)
}
