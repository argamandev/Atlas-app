import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeXml, parseFilingFacts, downloadXbrl, persistFilingFacts } from './xbrl'

// A minimal ת930-shaped instance: duration + instant contexts, an ILS unit,
// three ifrs-full numerics and two ifrs-il metadata facts.
const INSTANCE = `<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2015-03-11/ifrs-full" xmlns:ifrs-il="http://xbrl.isa.gov.il/taxonomy/2017-07-15/ifrs-il" xmlns:iso4217="http://www.xbrl.org/2003/iso4217">
  <xbrli:context id="D2026Q1">
    <xbrli:period><xbrli:startDate>2026-01-01</xbrli:startDate><xbrli:endDate>2026-03-31</xbrli:endDate></xbrli:period>
  </xbrli:context>
  <xbrli:context id="I20260331">
    <xbrli:period><xbrli:instant>2026-03-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <xbrli:unit id="U-ILS"><xbrli:measure>iso4217:ILS</xbrli:measure></xbrli:unit>
  <ifrs-full:Revenue contextRef="D2026Q1" unitRef="U-ILS" decimals="-3">358700000</ifrs-full:Revenue>
  <ifrs-full:ProfitLoss contextRef="D2026Q1" unitRef="U-ILS" decimals="-3">-1200000</ifrs-full:ProfitLoss>
  <ifrs-full:Assets contextRef="I20260331" unitRef="U-ILS" decimals="-3">901000000</ifrs-full:Assets>
  <ifrs-il:MagnaReferenceNumber contextRef="D2026Q1">2026-01-049051</ifrs-il:MagnaReferenceNumber>
  <ifrs-il:AuditorName contextRef="D2026Q1">קוסט פורר גבאי את קסירר</ifrs-il:AuditorName>
</xbrli:xbrl>`

test('parses numeric ifrs-full facts with periods and currency', () => {
  const { facts, numericCount } = parseFilingFacts(INSTANCE)
  assert.equal(numericCount, 3)

  const revenue = facts.find((f) => f.concept === 'ifrs-full:Revenue')!
  assert.equal(revenue.value, 358700000)
  assert.equal(revenue.currency, 'ILS')
  assert.equal(revenue.periodStart, '2026-01-01')
  assert.equal(revenue.periodEnd, '2026-03-31')

  const assets = facts.find((f) => f.concept === 'ifrs-full:Assets')!
  assert.equal(assets.periodStart, '2026-03-31')
  assert.equal(assets.periodEnd, '2026-03-31', 'instant facts carry start = end')

  const loss = facts.find((f) => f.concept === 'ifrs-full:ProfitLoss')!
  assert.equal(loss.value, -1200000)
})

test('ifrs-il metadata facts stay TEXTUAL — a digit-bearing MAGNA ref is never a numeric zero', () => {
  const { facts } = parseFilingFacts(INSTANCE)
  const magna = facts.find((f) => f.concept === 'ifrs-il:MagnaReferenceNumber')!
  assert.equal(magna.value, null)
  assert.equal(magna.metadata.text, '2026-01-049051')
  const auditor = facts.find((f) => f.concept === 'ifrs-il:AuditorName')!
  assert.equal(auditor.metadata.text, 'קוסט פורר גבאי את קסירר')
})

test('an instance with no numeric fact set reports numericCount 0 — "no structured facts", never zeros', () => {
  const empty = `<?xml version="1.0"?><xbrli:xbrl xmlns:xbrli="x"><xbrli:context id="c"/></xbrli:xbrl>`
  const { facts, numericCount } = parseFilingFacts(empty)
  assert.equal(numericCount, 0)
  assert.equal(facts.length, 0)
})

test('looksLikeXml: BOM+xml and bare xml pass; an HTML interstitial fails', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  assert.ok(looksLikeXml(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('<?xml version="1.0"?>')])))
  assert.ok(looksLikeXml(enc('<?xml version="1.0"?>')))
  assert.ok(!looksLikeXml(enc('<html><body>Access denied</body></html>')))
  assert.ok(!looksLikeXml(new Uint8Array(0)))
})

test('downloadXbrl: a 200 HTML page is a FAILURE (retried once), real XML succeeds', async () => {
  let calls = 0
  const htmlAlways = (async () => {
    calls++
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode('<html>waf</html>').buffer }
  }) as unknown as typeof fetch
  const bad = await downloadXbrl('https://mayafiles.tase.co.il/xbrl/x.xbrl', { fetchImpl: htmlAlways })
  assert.ok(!bad.ok)
  assert.equal(calls, 2, 'retried once, then failed honestly')

  const xmlOk = (async () => ({
    ok: true,
    arrayBuffer: async () => new TextEncoder().encode(INSTANCE).buffer,
  })) as unknown as typeof fetch
  const good = await downloadXbrl('https://mayafiles.tase.co.il/xbrl/x.xbrl', { fetchImpl: xmlOk })
  assert.ok(good.ok)
  if (good.ok) assert.match(good.data, /ifrs-full:Revenue/)
})

test('persistFilingFacts upserts on the (report, concept, period) identity', async () => {
  let captured: { rows: unknown[]; onConflict: string } | null = null
  const db = {
    from(table: string) {
      assert.equal(table, 'filing_facts')
      return {
        upsert(rows: unknown[], opts: { onConflict: string }) {
          captured = { rows, onConflict: opts.onConflict }
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  const { facts } = parseFilingFacts(INSTANCE)
  await persistFilingFacts(db, { mayaReportId: 1744027, companyId: 'c-uuid', facts })
  assert.ok(captured)
  const { rows, onConflict } = captured!
  assert.equal(onConflict, 'maya_report_id,concept,period_start,period_end')
  assert.equal(rows.length, 5)
  const rev = (rows as Array<Record<string, unknown>>).find((r) => r.concept === 'ifrs-full:Revenue')!
  assert.equal(rev.maya_report_id, 1744027)
  assert.equal(rev.company_id, 'c-uuid')
  assert.equal(rev.value, 358700000)
})
