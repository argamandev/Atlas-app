/**
 * Debug: dumps all href patterns found on the MAYA list page.
 * Run: npx tsx src/debug-maya.ts
 */
import 'dotenv/config'
import { getBrowser, closeBrowser } from './browser'

async function main() {
  const browser = await getBrowser()
  const page = await browser.newPage()

  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      get: () =>
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    })
  })

  const url = 'https://maya.tase.co.il/he/reports/companies?isPriority=false&isTradeHalt=false&by=company&eventsFamilyIds[]=900'
  console.log('Navigating to:', url)
  await page.goto(url, { waitUntil: 'networkidle' })

  const title = await page.title()
  console.log('Page title:', title)

  // Dump all unique href patterns
  const allLinks: string[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'))
      .map(a => (a as HTMLAnchorElement).href)
      .filter((v, i, arr) => arr.indexOf(v) === i)
  )

  console.log(`\nTotal unique links: ${allLinks.length}`)
  console.log('\n--- Links containing "reports" ---')
  allLinks
    .filter(h => h.includes('report'))
    .forEach(h => console.log(' ', h))

  console.log('\n--- Links containing "companies" ---')
  allLinks
    .filter(h => h.includes('compan'))
    .slice(0, 20)
    .forEach(h => console.log(' ', h))

  console.log('\n--- First 30 unique href patterns (grouped by path prefix) ---')
  const patterns = new Set(allLinks.map(h => {
    try { return new URL(h).pathname.replace(/\/\d+/g, '/{id}') } catch { return h }
  }))
  ;[...patterns].slice(0, 30).forEach(p => console.log(' ', p))

  await page.close()
  await closeBrowser()
}

main().catch(console.error)
