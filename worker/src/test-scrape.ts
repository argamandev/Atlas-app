/**
 * Tests MAYA list-page scraping.
 * Run: npx tsx src/test-scrape.ts
 *
 * Expected output: a list of recent insider reports found on MAYA.
 * If you see 0 reports or selector errors, the CSS selector needs updating.
 */
import 'dotenv/config'
import { fetchRecentInsiderReports } from './maya'
import { closeBrowser } from './browser'

async function main() {
  console.log('Scraping MAYA list page…')
  const reports = await fetchRecentInsiderReports()

  if (reports.length === 0) {
    console.error('ERROR: No reports found. Possible causes:')
    console.error('  • The CSS selector no longer matches MAYA\'s HTML')
    console.error('  • MAYA blocked the request (check for Cloudflare challenge)')
    console.error('  • No insider reports filed in the last 24 hours')
    await closeBrowser()
    process.exit(1)
  }

  console.log(`\nFound ${reports.length} reports:\n`)
  reports.forEach((r, i) => {
    console.log(`${i + 1}. ${r.companyName}`)
    console.log(`   Subject : ${r.subject ?? '(not extracted)'}`)
    console.log(`   Date    : ${r.publicationDate}`)
    console.log(`   URL     : ${r.reportUrl}`)
    console.log()
  })

  await closeBrowser()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
