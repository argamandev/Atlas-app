/**
 * Debug: shows the HTML structure of the first report row on the MAYA list page.
 */
import 'dotenv/config'
import { getBrowser, closeBrowser } from './browser'

async function main() {
  const browser = await getBrowser()
  const page = await browser.newPage()

  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' })
  await page.goto(
    'https://maya.tase.co.il/he/reports/companies?isPriority=false&isTradeHalt=false&by=company&eventsFamilyIds[]=900',
    { waitUntil: 'networkidle' }
  )

  // Find first report link and walk up to the full row container, dump its outerHTML
  const info = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'))
      .filter((a) => /\/he\/reports\/companies\/\d+$/.test((a as HTMLAnchorElement).href))

    if (links.length === 0) return { count: 0, html: '', text: '', hrefs: [] }

    const first = links[0] as HTMLAnchorElement
    // Walk up to find a meaningful container
    let container: Element | null = first
    for (let i = 0; i < 6; i++) {
      if (!container?.parentElement) break
      container = container.parentElement
      if (container.children.length > 2) break // found a row with multiple children
    }

    return {
      count: links.length,
      hrefs: links.slice(0, 5).map(a => (a as HTMLAnchorElement).href),
      html: container?.outerHTML?.slice(0, 3000) ?? '',
      textContent: container?.textContent?.slice(0, 500) ?? '',
      anchorText: first.textContent?.trim() ?? '',
    }
  })

  console.log(`Found ${info.count} clean report links\n`)
  console.log('First 5 URLs:')
  info.hrefs.forEach(h => console.log(' ', h))
  console.log('\nAnchor textContent:', JSON.stringify(info.anchorText))
  console.log('\nContainer textContent:', JSON.stringify(info.textContent?.slice(0, 300)))
  console.log('\nContainer HTML (first 3000 chars):')
  console.log(info.html)

  await page.close()
  await closeBrowser()
}

main().catch(console.error)
