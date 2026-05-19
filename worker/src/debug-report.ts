/**
 * Debug: dumps the raw innerText of a MAYA report page.
 * Run: npx tsx src/debug-report.ts https://maya.tase.co.il/he/reports/companies/1741509
 */
import 'dotenv/config'
import { getBrowser, closeBrowser } from './browser'

async function main() {
  const url = process.argv[2] ?? 'https://maya.tase.co.il/he/reports/companies/1741509'
  console.log('Fetching:', url, '\n')

  const browser = await getBrowser()
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' })
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

  // Wait for table to render
  try { await page.waitForSelector('table', { timeout: 10000 }) } catch { /**/ }

  const innerText: string = await page.evaluate(() => document.body.innerText)
  const innerHTML: string = await page.evaluate(() => {
    // Look for the main content area
    const main = document.querySelector('main') ??
                 document.querySelector('[class*="content"]') ??
                 document.querySelector('[class*="report"]') ??
                 document.querySelector('article')
    return main?.innerHTML?.slice(0, 4000) ?? 'no main element found'
  })

  console.log('=== innerText (first 3000 chars) ===')
  console.log(innerText.slice(0, 3000))
  console.log('\n=== main innerHTML (first 4000 chars) ===')
  console.log(innerHTML)

  await page.close()
  await closeBrowser()
}

main().catch(console.error)
