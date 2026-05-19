import { SupabaseClient } from '@supabase/supabase-js'
import type { InsiderReport, ReportDetails } from './maya'
import { sendInsiderEmail } from './email'
import { sendInsiderWhatsApp } from './whatsapp'

export interface NotifPrefs {
  notify_email: boolean
  notify_whatsapp: boolean
  email: string | null
  whatsapp_phone: string | null
}

const MAX_FAILURES = 5

async function tryInsertAlert(
  supabase: SupabaseClient,
  reportId: string,
  userId: string,
  channel: string,
  reportUrl: string,
  companyName: string
): Promise<{ inserted: boolean; existingRow: { id: string; failure_count: number } | null }> {
  const { data, error } = await supabase
    .from('sent_alerts')
    .insert({
      report_id: reportId,
      user_id: userId,
      channel,
      report_url: reportUrl,
      company_name: companyName,
    })
    .select('id, failure_count')
    .single()

  if (error) {
    // 23505 = unique violation — already sent
    if ((error as any).code === '23505') {
      return { inserted: false, existingRow: null }
    }
    throw error
  }

  return { inserted: true, existingRow: data }
}

async function recordSendFailure(
  supabase: SupabaseClient,
  rowId: string,
  currentFailureCount: number,
  errorMessage: string,
  reportId: string,
  userId: string,
  channel: string
): Promise<void> {
  const newCount = currentFailureCount + 1
  await supabase
    .from('sent_alerts')
    .update({ failure_count: newCount, error_message: errorMessage })
    .eq('id', rowId)

  if (newCount >= MAX_FAILURES) {
    console.error(
      '[maya-poller] PERMANENT FAILURE: giving up on alert',
      reportId,
      userId,
      channel
    )
  }
}

export async function dispatchAlert({
  supabase,
  userId,
  prefs,
  report,
  details,
}: {
  supabase: SupabaseClient
  userId: string
  prefs: NotifPrefs
  report: InsiderReport
  details?: ReportDetails
}): Promise<void> {
  if (prefs.notify_email && prefs.email) {
    try {
      const { inserted, existingRow: insertedRow } = await tryInsertAlert(
        supabase,
        report.reportId,
        userId,
        'email',
        report.reportUrl,
        report.companyName
      )

      if (!inserted) {
        // already sent — check if we should still retry a previous failure
        const { data: existing } = await supabase
          .from('sent_alerts')
          .select('id, failure_count')
          .eq('report_id', report.reportId)
          .eq('user_id', userId)
          .eq('channel', 'email')
          .maybeSingle()

        if (!existing || existing.failure_count >= MAX_FAILURES || existing.failure_count === 0) {
          // Either fully sent (failure_count 0 means no failures = success) or permanently failed
          // failure_count 0 on existing row means it was sent successfully; skip
          return
        }
        // Has previous failures below max — attempt retry
        try {
          await sendInsiderEmail({
            to: prefs.email,
            companyName: report.companyName,
            reportUrl: report.reportUrl,
          })
          // Success — clear failure state
          await supabase
            .from('sent_alerts')
            .update({ failure_count: 0, error_message: null })
            .eq('id', existing.id)
        } catch (sendErr) {
          console.error(
            `[maya-poller] email alert failed for user ${userId} report ${report.reportId}:`,
            sendErr
          )
          await recordSendFailure(
            supabase,
            existing.id,
            existing.failure_count,
            String(sendErr),
            report.reportId,
            userId,
            'email'
          )
        }
        return
      }

      // Fresh insert succeeded — attempt send
      try {
        await sendInsiderEmail({
          to: prefs.email,
          companyName: report.companyName,
          reportUrl: report.reportUrl,
          details,
        })
      } catch (sendErr) {
        console.error(
          `[maya-poller] email alert failed for user ${userId} report ${report.reportId}:`,
          sendErr
        )
        await recordSendFailure(
          supabase,
          insertedRow!.id,
          0,
          String(sendErr),
          report.reportId,
          userId,
          'email'
        )
      }
    } catch (err) {
      console.error(
        `[maya-poller] email alert setup failed for user ${userId} report ${report.reportId}:`,
        err
      )
    }
  }

  if (prefs.notify_whatsapp && prefs.whatsapp_phone) {
    try {
      const { inserted, existingRow: insertedRow } = await tryInsertAlert(
        supabase,
        report.reportId,
        userId,
        'whatsapp',
        report.reportUrl,
        report.companyName
      )

      if (!inserted) {
        const { data: existing } = await supabase
          .from('sent_alerts')
          .select('id, failure_count')
          .eq('report_id', report.reportId)
          .eq('user_id', userId)
          .eq('channel', 'whatsapp')
          .maybeSingle()

        if (!existing || existing.failure_count >= MAX_FAILURES || existing.failure_count === 0) {
          return
        }
        try {
          await sendInsiderWhatsApp({
            to: prefs.whatsapp_phone,
            companyName: report.companyName,
            reportUrl: report.reportUrl,
          })
          await supabase
            .from('sent_alerts')
            .update({ failure_count: 0, error_message: null })
            .eq('id', existing.id)
        } catch (sendErr) {
          console.error(
            `[maya-poller] whatsapp alert failed for user ${userId} report ${report.reportId}:`,
            sendErr
          )
          await recordSendFailure(
            supabase,
            existing.id,
            existing.failure_count,
            String(sendErr),
            report.reportId,
            userId,
            'whatsapp'
          )
        }
        return
      }

      try {
        await sendInsiderWhatsApp({
          to: prefs.whatsapp_phone,
          companyName: report.companyName,
          reportUrl: report.reportUrl,
          details,
        })
      } catch (sendErr) {
        console.error(
          `[maya-poller] whatsapp alert failed for user ${userId} report ${report.reportId}:`,
          sendErr
        )
        await recordSendFailure(
          supabase,
          insertedRow!.id,
          0,
          String(sendErr),
          report.reportId,
          userId,
          'whatsapp'
        )
      }
    } catch (err) {
      console.error(
        `[maya-poller] whatsapp alert setup failed for user ${userId} report ${report.reportId}:`,
        err
      )
    }
  }
}
