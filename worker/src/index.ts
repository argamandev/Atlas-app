import 'dotenv/config'
import cron from 'node-cron'
import { createClient } from '@supabase/supabase-js'
import { fetchRecentInsiderReports } from './maya'
import { closeBrowser } from './browser'
import { dispatchAlert } from './notify'
import { matchReportsToWatchlist } from './matcher'
import { fetchReportDetails, type InsiderReport } from './maya'

// Periodic "holdings as-of-date" snapshots (e.g. "החזקות בעלי עניין ליום 15.5.26") are routine
// filings — not new transactions. Store them in seen_reports (useful for the UI panel) but skip
// watchlist matching and alerts for them.
function isTransactionReport(r: InsiderReport): boolean {
  if (!r.subject) return true // no subject extracted → assume it might be relevant
  return !/ליום\s+\d/.test(r.subject)
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

let isRunning = false

async function tick(): Promise<void> {
  if (isRunning) {
    console.log('[maya-poller] skipping tick: previous run still in progress')
    return
  }
  isRunning = true
  try {
    const reports = await fetchRecentInsiderReports()

    if (reports.length > 0) {
      const { error: seenErr } = await supabase
        .from('seen_reports')
        .upsert(
          reports.map((r) => ({
            report_id: r.reportId,
            company_name: r.companyName,
            report_url: r.reportUrl,
            publication_date: r.publicationDate,
          })),
          { onConflict: 'report_id', ignoreDuplicates: true }
        )
      if (seenErr) {
        console.error('[maya-poller] failed to upsert seen_reports:', seenErr.message)
      }
    }

    const { data: watchlistRows, error: wErr } = await supabase
      .from('watchlist')
      .select('user_id, ticker, company_name')

    if (wErr) {
      console.error('[maya-poller] failed to load watchlist:', wErr.message)
      return
    }

    const rows = watchlistRows ?? []

    // Only match actual transactions (not periodic "ליום" snapshots) against the watchlist
    const transactionReports = reports.filter(isTransactionReport)
    const matches = matchReportsToWatchlist(transactionReports, rows)

    console.log(
      `[maya-poller] tick: ${reports.length} reports (${transactionReports.length} transactions, ${reports.length - transactionReports.length} snapshots), ${matches.length} watchlist matches`
    )

    for (const { userId, report } of matches) {
      // Open the individual report page to verify form type and extract transaction details.
      // Returns null if the form is not ת076/ת078 (skip alerting).
      const details = await fetchReportDetails(report.reportUrl)
      if (details === null) {
        console.log(
          `[maya-poller] skipping alert for "${report.companyName}" — form type not relevant`
        )
        continue
      }

      const { data: prefs } = await supabase
        .from('notification_prefs')
        .select('notify_email, notify_whatsapp, email, whatsapp_phone')
        .eq('user_id', userId)
        .maybeSingle()

      if (!prefs) continue

      await dispatchAlert({
        supabase,
        userId,
        prefs,
        report,
        details,
      })
    }
  } catch (err) {
    console.error('[maya-poller] tick error:', err)
  } finally {
    isRunning = false
  }
}

cron.schedule('*/2 * * * *', tick)

tick()

process.on('SIGTERM', async () => {
  await closeBrowser()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await closeBrowser()
  process.exit(0)
})
