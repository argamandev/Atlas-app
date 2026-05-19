import { getBrowser } from './browser'
import type { Page } from 'playwright'

// Family 900 covers ALL insider-related reports (ת076 = form 33ב, ת078 = form 33ה-ו, and others).
const INSIDER_FAMILY_IDS = [900]

// Only these form types are actionable insider transactions worth alerting on.
// ת076 = form 33(ב) — change in holdings by existing insider
// ת078 = form 33(ה)-(ו) — person/entity becomes or ceases to be an insider
const RELEVANT_FORMS = new Set(['ת076', 'ת078'])

const MAYA_BASE =
  'https://maya.tase.co.il/he/reports/companies?isPriority=false&isTradeHalt=false&by=company'

function buildMayaUrl(familyIds: number[]): string {
  const params = familyIds.map((id) => `eventsFamilyIds[]=${id}`).join('&')
  return `${MAYA_BASE}&${params}`
}

function parseIsraeliDate(str: string): Date | null {
  if (!str) return null

  const israeliMatch = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (israeliMatch) {
    const [, d, m, y, hh = '0', mm = '0'] = israeliMatch
    const date = new Date(
      parseInt(y, 10),
      parseInt(m, 10) - 1,
      parseInt(d, 10),
      parseInt(hh, 10),
      parseInt(mm, 10)
    )
    if (!isNaN(date.getTime())) return date
  }

  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) return parsed

  return null
}

export interface InsiderReport {
  reportId: string
  companyName: string
  reportUrl: string
  publicationDate: string
  subject: string | null
}

// Extracted fields from the opened report document.
// null means the field was not found in the HTML — alert is still sent without it.
export interface ReportDetails {
  formType: string | null       // "ת076" | "ת078"
  holderName: string | null     // "אבי סמל"
  actionType: string | null     // "גידול במניות עקב המרת ני\"ע"
  securityName: string | null   // "נקסטייג' - מניה רגילה"
  quantity: string | null       // "5,697,524"
  price: string | null          // "80 אג'"
  actionDate: string | null     // "14/05/2026"
  holdingPctAfter: string | null // "6.01%"
}

// Constructs the direct URL to the static HTML form file on mayafiles.tase.co.il.
// Pattern confirmed by intercepting network requests on the MAYA report page.
// Example: reportId 1741509 → /rhtm/1741001-1742000/H1741509.htm
function getMayaFileUrl(reportId: string): string {
  const id = parseInt(reportId, 10)
  const base = Math.floor(id / 1000) * 1000
  const bucket = `${base + 1}-${base + 1000}`
  return `https://mayafiles.tase.co.il/rhtm/${bucket}/H${reportId}.htm`
}

// Returns null if the form type is not relevant (skip alerting).
// Returns ReportDetails with best-effort extracted fields otherwise.
export async function fetchReportDetails(reportUrl: string): Promise<ReportDetails | null> {
  // Extract numeric reportId from the MAYA report URL
  const idMatch = reportUrl.match(/\/he\/reports\/companies\/(\d+)/)
  if (!idMatch) return { formType: null, holderName: null, actionType: null, securityName: null, quantity: null, price: null, actionDate: null, holdingPctAfter: null }

  const reportId = idMatch[1]
  const htmUrl = getMayaFileUrl(reportId)

  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' })
    // Fetch the static HTML form file directly — no Angular overhead, just raw form content
    await page.goto(htmUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

    const rawText: string = await page.evaluate(() => document.body.innerText)

    // --- Form type ---
    // MAYA header shows "ת 078 (פומבי)" or "ת076"
    const formMatch = rawText.match(/ת\s*(\d{3})/)
    const formType = formMatch ? ('ת' + formMatch[1]) : null

    if (formType && !RELEVANT_FORMS.has(formType)) {
      console.log(`[maya-poller] skipping form ${formType} — not ת076/ת078`)
      return null
    }

    // --- Targeted regex extraction ---
    // ת076 (שינוי החזקות) and ת078 (הפיכה לבעל עניין) use different field names.
    // We try both variants for each field.

    // Holder name
    // ת078: "שם פרטי: אבי" + "שם משפחה/שם תאגיד: סמל"
    // ת076: "שם תאגיד/שם משפחה ושם פרטי של המחזיק:" — often blank; skip for now
    // Use [ \t]* (not \s*) so we only capture text on the same line — \s* would span newlines and grab the next field label when the value is blank
    const firstName = rawText.match(/שם פרטי:[ \t]*([^\n\t]+)/)?.[1]?.trim() ?? null
    const lastName = rawText.match(/שם משפחה\/שם תאגיד:[ \t]*([^\n\t]+)/)?.[1]?.trim() ?? null
    const holderName = [firstName, lastName].filter(Boolean).join(' ').trim() || null

    // Action type
    // ת076: "מהות השינוי: קיטון עקב מכירה מחוץ לבורסה"
    // ת078: "מהות הפעולה גידול במניות עקב המרת ני"ע"
    const rawActionType =
      rawText.match(/מהות השינוי:\s*([^\n]+)/)?.[1]?.trim() ??
      rawText.match(/מהות הפעולה\s+([^\n_]+)/)?.[1]?.trim() ??
      rawText.match(/מהות הפעולה:\s*([^\n]+)/)?.[1]?.trim() ??
      null
    // Strip fill-in-the-blank underscores left in ת076 forms (e.g. "קיטון _________ עקב")
    const actionType = rawActionType ? rawActionType.replace(/_{2,}/g, '').replace(/\s{2,}/g, ' ').trim() || null : null

    // Security name (mainly ת078; ת076 leaves this field blank)
    const rawSecurityName =
      rawText.match(/שם וסוג נייר הערך[^:]*:[^\n]*\n\s*([^\n\t:]+)/)?.[1]?.trim() ?? null
    // Reject if the captured text is actually a field label (happens when field is blank in ת076)
    const KNOWN_LABELS = new Set(['מהות השינוי', 'מהות הפעולה', 'תאריך השינוי', 'שם תאגיד', 'מספר זיהוי'])
    // Also reject section headers like "ג. מספר נייר ערך בבורסה" (single Hebrew letter + dot)
    const securityName = (rawSecurityName && !KNOWN_LABELS.has(rawSecurityName) && !/^[א-ת]\.\s/.test(rawSecurityName)) ? rawSecurityName : null

    // Quantity
    // ת076: "שינוי בכמות ניירות הערך: 56,033 +"  or  "62,400 -"
    // ת078: "כמות ני"ע נשוא הפעולה : 5,697,524"
    const rawQuantity =
      rawText.match(/שינוי בכמות ניירות הערך:\s*([\d,]+ [+-])/)?.[1] ??
      rawText.match(/שינוי בכמות ניירות הערך:\s*([\d,]+)/)?.[1] ??
      rawText.match(/כמות ני"ע[^:]*:\s*([\d,]+)/)?.[1] ??
      null
    const quantity = rawQuantity

    // Price
    // ת076: "שער העסקה: 102.83   מטבע אג'"
    // ת078: "השער בו בוצעה הפעולה: 80 אג'"
    const price =
      rawText.match(/שער העסקה:\s*([\d.]+\s+מטבע\s+[^\n]+)/)?.[1]?.trim() ??
      rawText.match(/שער העסקה:\s*([^\n]+)/)?.[1]?.trim() ??
      rawText.match(/השער בו בוצעה הפעולה:\s*([^_\n]+)/)?.[1]?.trim() ??
      null

    // Date
    // ת076: "תאריך השינוי: 15/05/2026"
    // ת078: "תאריך ביצוע הפעולה 14/05/2026"
    const actionDate =
      rawText.match(/תאריך השינוי:\s*(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] ??
      rawText.match(/תאריך ביצוע הפעולה\s+(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] ??
      null

    // Holding % after transaction
    // ת076: "שיעור החזקה לאחר השינוי: בהון: % 2.51"
    // ת078: first X.XX number after "מצבת החזקות"
    const holdingPctMatch =
      rawText.match(/שיעור החזקה לאחר השינוי:\s*בהון:\s*%\s*([\d.]+)/)?.[1] ??
      rawText.match(/שיעור החזקה נוכחי[^%]*%\s*([\d.]+)/)?.[1] ??
      rawText.split(/מצבת החזקות/)?.[1]?.match(/(\d{1,3}\.\d{2})/)?.[1] ??
      null
    const holdingPctAfter = holdingPctMatch ? holdingPctMatch + '%' : null

    const details: ReportDetails = {
      formType,
      holderName,
      actionType,
      securityName,
      quantity,
      price,
      actionDate,
      holdingPctAfter,
    }

    console.log(
      `[maya-poller] report ${reportUrl.split('/').pop()} (${formType}):`,
      `${holderName} | ${actionType} | ${quantity} ני"ע | שער ${price}`
    )

    return details
  } catch (err) {
    console.error('[maya-poller] fetchReportDetails error:', reportUrl, err)
    // On error: return empty details (don't block the alert)
    return {
      formType: null,
      holderName: null,
      actionType: null,
      securityName: null,
      quantity: null,
      price: null,
      actionDate: null,
      holdingPctAfter: null,
    }
  } finally {
    await page.close()
  }
}

async function scrapePageReports(page: Page, url: string): Promise<InsiderReport[]> {
  await page.goto(url, { waitUntil: 'networkidle' })

  // MAYA Angular app structure (confirmed by inspection):
  //   .feed-main              — full report row
  //     .feed-title h3 a      — company name link (/he/companies/{id})
  //     .feed-date-text       — "16.05.2026"
  //     .feed-time-text       — "23:29"
  //     a.feed-text-link      — report subject link (/he/reports/companies/{numericId})
  //     .icons-doc a          — HTML/PDF icon links (no text content)
  //
  // We target only a.feed-text-link — the main report anchor with subject as textContent.
  const selector = 'a.feed-text-link'

  try {
    await page.waitForSelector(selector, { timeout: 20000 })
  } catch {
    console.warn('[maya-poller] no report links found — selector "a.feed-text-link" may have changed')
    return []
  }

  return page.$$eval(selector, (anchors) => {
    return anchors
      .map((a) => {
        const href = (a as HTMLAnchorElement).href
        const match = href.match(/\/he\/reports\/companies\/(\d+)/)
        if (!match) return null
        const reportId = match[1]

        // Walk up to .feed-main (the full row) to access siblings
        const row =
          (a.closest('.feed-main') as Element | null) ??
          (a.closest('[class*="feed"]') as Element | null) ??
          a.parentElement

        // Company name: h3 > a inside .feed-title (sibling of .feed-texts)
        const companyEl =
          row?.querySelector('h3 a') ??
          row?.querySelector('a[href*="/he/companies/"]')
        const companyName = companyEl?.textContent?.trim() ?? ''
        if (!companyName) return null

        // Report subject: the anchor's own text
        const subject = a.textContent?.trim() || null

        // Date + time (include time so 24h window works correctly for late-evening reports)
        const dateText = row?.querySelector('.feed-date-text')?.textContent
          ?.replace(/[^\d./]/g, '').trim() ?? ''
        const timeText = row?.querySelector('.feed-time-text')?.textContent
          ?.replace(/[^\d:]/g, '').trim() ?? ''
        const publicationDate = timeText ? `${dateText} ${timeText}` : dateText

        return { reportId, companyName, reportUrl: href, publicationDate, subject }
      })
      .filter((r): r is InsiderReport => r !== null && r.reportId !== '' && r.companyName !== '')
  })
}

export async function fetchRecentInsiderReports(): Promise<InsiderReport[]> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' })
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () =>
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      })
    })

    const url = buildMayaUrl(INSIDER_FAMILY_IDS)
    const reports = await scrapePageReports(page, url)

    const seen = new Set<string>()
    const deduped = reports.filter((r) => {
      if (seen.has(r.reportId)) return false
      seen.add(r.reportId)
      return true
    })

    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const recent = deduped.filter((r) => {
      const parsed = parseIsraeliDate(r.publicationDate)
      if (parsed === null) return true
      return parsed.getTime() >= cutoff
    })

    console.log(
      `[maya-poller] scraped ${recent.length} recent reports`,
      recent.slice(0, 3).map((r) => `${r.companyName} | ${r.subject ?? '—'}`)
    )

    return recent
  } catch (err) {
    console.error('[maya-poller] fetchRecentInsiderReports error:', err)
    return []
  } finally {
    await page.close()
  }
}
