import 'dotenv/config'
import { getBrowser, closeBrowser } from './browser'

async function main() {
  const reportId = process.argv[2] ?? '1741509'
  const id = parseInt(reportId)
  const base = Math.floor(id / 1000) * 1000
  const htmUrl = `https://mayafiles.tase.co.il/rhtm/${base + 1}-${base + 1000}/H${reportId}.htm`

  console.log('Fetching:', htmUrl)
  const browser = await getBrowser()
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' })
  await page.goto(htmUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

  const text = await page.evaluate(() => document.body.innerText)
  const html = await page.evaluate(() => document.body.innerHTML.slice(0, 3000))

  console.log('\n=== innerText ===\n' + text.slice(0, 5000))
  console.log('\n=== innerHTML (3000 chars) ===\n' + html)

  await page.close()
  await closeBrowser()
}
main().catch(console.error)
