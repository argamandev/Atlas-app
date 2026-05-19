/**
 * Intercepts network requests on the MAYA report page to find the form content API.
 * Run: npx tsx src/debug-network.ts
 */
import 'dotenv/config'
import { getBrowser, closeBrowser } from './browser'

async function main() {
  const reportId = '1741509'
  const url = `https://maya.tase.co.il/he/reports/companies/${reportId}?attachmentType=htm`

  const browser = await getBrowser()
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' })

  // Capture all network requests
  const apiRequests: string[] = []
  page.on('request', (req) => {
    const u = req.url()
    if (u.includes('api') || u.includes('report') || u.includes(reportId) || u.includes('.htm')) {
      apiRequests.push(`[${req.method()}] ${u}`)
    }
  })

  console.log('Navigating to:', url)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

  // Try waiting extra time for lazy-loaded content
  await page.waitForTimeout(3000)

  // Look for iframes
  const iframes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src,
      id: f.id,
      className: f.className,
    }))
  )

  // Look for the right-side panel content
  const rightPanelText = await page.evaluate(() => {
    const panels = document.querySelectorAll('[class*="panel"]')
    return Array.from(panels).map(p => ({
      class: p.className,
      textLength: p.textContent?.length ?? 0,
      preview: p.textContent?.slice(0, 200) ?? '',
    }))
  })

  console.log('\n=== Network Requests (API/report related) ===')
  apiRequests.forEach(r => console.log(' ', r))

  console.log('\n=== Iframes ===')
  console.log(iframes)

  console.log('\n=== Panel elements (class + text length) ===')
  rightPanelText.forEach(p => console.log(` [${p.class}] len=${p.textLength} preview: ${p.preview.slice(0, 100)}`))

  await page.close()
  await closeBrowser()
}

main().catch(console.error)
