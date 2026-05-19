/**
 * Tests individual report detail extraction against a real MAYA report URL.
 * Run: npx tsx src/test-report.ts https://maya.tase.co.il/he/reports/companies/1741474
 *
 * Expected output: extracted fields (holder name, quantity, price, etc.)
 * Useful for verifying regex patterns against real MAYA report HTML.
 */
import 'dotenv/config'
import { fetchReportDetails } from './maya'
import { closeBrowser } from './browser'

async function main() {
  const url = process.argv[2]
  if (!url || !url.startsWith('https://maya.tase.co.il/')) {
    console.error('Usage: npx tsx src/test-report.ts <maya-report-url>')
    console.error('Example: npx tsx src/test-report.ts https://maya.tase.co.il/he/reports/companies/1741474')
    process.exit(1)
  }

  console.log(`Fetching details from: ${url}\n`)
  const details = await fetchReportDetails(url)

  if (details === null) {
    console.log('Result: SKIP — form type is not ת076 or ת078')
    console.log('This report would NOT trigger an alert.')
  } else {
    console.log('Result: ALERT — extracted fields:')
    console.log(`  Form type     : ${details.formType ?? '(not detected)'}`)
    console.log(`  Holder name   : ${details.holderName ?? '(not found)'}`)
    console.log(`  Action type   : ${details.actionType ?? '(not found)'}`)
    console.log(`  Security name : ${details.securityName ?? '(not found)'}`)
    console.log(`  Quantity      : ${details.quantity ?? '(not found)'}`)
    console.log(`  Price         : ${details.price ?? '(not found)'}`)
    console.log(`  Action date   : ${details.actionDate ?? '(not found)'}`)
    console.log(`  Holding after : ${details.holdingPctAfter ?? '(not found)'}`)
  }

  await closeBrowser()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
