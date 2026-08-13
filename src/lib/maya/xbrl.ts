// ─────────────────────────────────────────────────────────────────────────────
// XBRL — the structured facts a financial report already carries.
//
// Every actual financial-statement filing on MAYA (events 101/104/105/106)
// attaches ISA's ת930 instance: `X{mayaReportId}.xbrl` on the public file host
// — taxonomies `ifrs-full` + `ifrs-il`, 26 numeric facts (P&L, balance sheet,
// cash flow) plus filing metadata (MAGNA ref, receipt time, auditor, review
// qualification). Parsing it at ingest makes numeric questions LOOKUPS, not
// searches (spec §2.2 `lookup_facts`). Measured facts:
// docs/archive/scratch/2026-08-13-smart-layer/research/14-maya-structured-data.md.
//
// GUARDS (standard §6, LAW — same class as the WAF-interstitial law):
//   * the body must BE XML — BOM (efbbbf) + `<?xml`, measured magic. A 200 HTML
//     page is a failure, never an empty fact set;
//   * a missing numeric fact set is "no structured facts", NEVER zeros;
//   * foreign-track issuers (ICL-shaped — no ISA XBRL at all) surface as a
//     visible `facts_status = 'none'`, not silence.
//
// The parser is deliberately regex-over-XML: the instance is machine-generated
// by one producer (MAGNA), flat, and small (≈20KB). A parse that finds nothing
// numeric reports numericCount 0 — and the caller records that honestly.
// ─────────────────────────────────────────────────────────────────────────────

import { MAYA_TIMEOUT_MS } from './config'
import type { MayaResult } from './types'

export interface XbrlFact {
  /** Namespaced concept, e.g. `ifrs-full:Revenue` or `ifrs-il:AuditorName`. */
  concept: string
  /** Numeric value, or null for textual metadata facts. */
  value: number | null
  /** ISO date strings; instant facts carry start = end; metadata may have neither. */
  periodStart: string | null
  periodEnd: string | null
  currency: string | null
  metadata: Record<string, string>
}

export interface ParsedXbrl {
  facts: XbrlFact[]
  /** Count of NUMERIC ifrs-full facts — the "is there a fact set at all" signal. */
  numericCount: number
}

/** BOM + `<?xml` (measured magic efbbbf3c) or bare `<?xml`. An HTML 200 fails here. */
export function looksLikeXml(bytes: Uint8Array): boolean {
  let i = 0
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3
  const head = Buffer.from(bytes.subarray(i, i + 5)).toString('latin1')
  return head === '<?xml'
}

type Period = { start: string | null; end: string | null }

function parseContexts(xml: string): Map<string, Period> {
  const out = new Map<string, Period>()
  const ctxRe = /<(?:\w+:)?context\s+id="([^"]+)"[\s\S]*?<\/(?:\w+:)?context>/g
  let m: RegExpExecArray | null
  while ((m = ctxRe.exec(xml))) {
    const body = m[0]
    const instant = body.match(/<(?:\w+:)?instant>([^<]+)<\/(?:\w+:)?instant>/)
    if (instant) {
      out.set(m[1], { start: instant[1].trim(), end: instant[1].trim() })
      continue
    }
    const start = body.match(/<(?:\w+:)?startDate>([^<]+)<\/(?:\w+:)?startDate>/)
    const end = body.match(/<(?:\w+:)?endDate>([^<]+)<\/(?:\w+:)?endDate>/)
    out.set(m[1], { start: start?.[1].trim() ?? null, end: end?.[1].trim() ?? null })
  }
  return out
}

function parseUnits(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  const unitRe = /<(?:\w+:)?unit\s+id="([^"]+)"[\s\S]*?<\/(?:\w+:)?unit>/g
  let m: RegExpExecArray | null
  while ((m = unitRe.exec(xml))) {
    const measure = m[0].match(/<(?:\w+:)?measure>(?:\w+:)?([^<]+)<\/(?:\w+:)?measure>/)
    if (measure) out.set(m[1], measure[1].trim())
  }
  return out
}

/** Parse an ISA ת930 instance. Facts from the ifrs-full and ifrs-il namespaces only. */
export function parseFilingFacts(xml: string): ParsedXbrl {
  const contexts = parseContexts(xml)
  const units = parseUnits(xml)
  const facts: XbrlFact[] = []
  let numericCount = 0

  const factRe = /<(ifrs-full|ifrs-il):([A-Za-z0-9_]+)((?:\s+[\w:.-]+="[^"]*")*)\s*>([^<]*)<\/\1:\2>/g
  let m: RegExpExecArray | null
  while ((m = factRe.exec(xml))) {
    const [, ns, local, attrText, raw] = m
    const attrs: Record<string, string> = {}
    const attrRe = /([\w:.-]+)="([^"]*)"/g
    let a: RegExpExecArray | null
    while ((a = attrRe.exec(attrText))) attrs[a[1]] = a[2]

    const text = raw.trim()
    if (!text) continue
    const period = attrs.contextRef ? (contexts.get(attrs.contextRef) ?? null) : null
    const currency = attrs.unitRef ? (units.get(attrs.unitRef) ?? null) : null

    // Numeric when it looks like a number AND carries a unit — ifrs-il metadata
    // (dates, names, MAGNA refs) stays textual even when digit-only.
    const numeric = attrs.unitRef !== undefined && /^-?\d+(\.\d+)?$/.test(text)
    const value = numeric ? Number(text) : null
    if (numeric && ns === 'ifrs-full') numericCount++

    const metadata: Record<string, string> = {}
    if (!numeric) metadata.text = text
    if (attrs.decimals) metadata.decimals = attrs.decimals

    facts.push({
      concept: `${ns}:${local}`,
      value,
      periodStart: period?.start ?? null,
      periodEnd: period?.end ?? null,
      currency,
      metadata,
    })
  }
  return { facts, numericCount }
}

export type DownloadXbrlOptions = { fetchImpl?: typeof fetch }

/**
 * Fetch an `.xbrl` attachment from the public file host (unmetered — NOT the
 * datawise budget, so no limiter). Validates the BYTES, not the envelope:
 * retry once, and a body that is not XML twice is a real failure.
 */
export async function downloadXbrl(url: string, opts: DownloadXbrlOptions = {}): Promise<MayaResult<string>> {
  const doFetch = opts.fetchImpl ?? fetch
  const once = async (): Promise<MayaResult<string>> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MAYA_TIMEOUT_MS)
    try {
      const res = await doFetch(url, { signal: controller.signal })
      if (!res.ok) return { ok: false, failure: { kind: 'unavailable', detail: `HTTP ${res.status}` } }
      const buf = new Uint8Array(await res.arrayBuffer())
      if (!looksLikeXml(buf)) {
        return { ok: false, failure: { kind: 'unavailable', detail: `not XML (${buf.length} bytes)` } }
      }
      return { ok: true, data: Buffer.from(buf).toString('utf8').replace(/^﻿/, '') }
    } catch (e) {
      const detail =
        (e as Error)?.name === 'AbortError' ? 'timeout' : ((e as Error)?.message ?? 'network error')
      return { ok: false, failure: { kind: 'unavailable', detail } }
    } finally {
      clearTimeout(timer)
    }
  }
  const first = await once()
  if (first.ok) return first
  return once()
}

/** Structural slice of a supabase client (injectable in tests). */
interface FactsDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any
}

/**
 * Persist parsed facts for one filing. Upsert on the (report, concept, period)
 * uniqueness (NULLS NOT DISTINCT, migration 025) — re-ingest converges on the
 * same rows instead of piling duplicates.
 */
/**
 * Collapse facts that share the `filing_facts` uniqueness key
 * (report, concept, period start, period end).
 *
 * WHY THIS IS NEEDED — measured, not guessed (bז"א's 2025 annual report,
 * mayaReportId 1730576): a ת930 instance repeats a concept once per SIGNATORY.
 * Three `NameOfFinancialStatementsSignatory` facts, three positions, three line
 * ids — all textual `ifrs-il` metadata, all sharing one key. Postgres answers a
 * multi-row upsert on one key with "ON CONFLICT DO UPDATE command cannot affect
 * row a second time", so the whole filing's facts failed to persist and landed
 * as a visible `facts_status = 'failed'`. The key models a fact, and a list of
 * signatories is not one fact.
 *
 * REPEATED TEXT IS KEPT, NOT DROPPED: the row carries the first value as `text`
 * (what every existing reader already looks at) plus the complete ordered list
 * as `values`. Losing two of three signatories to make an insert succeed would
 * be exactly the silent degradation the standard forbids.
 *
 * A NUMERIC COLLISION IS A DIFFERENT ANIMAL AND THROWS. Two different numbers
 * for one concept-and-period is a genuine ambiguity — picking one would be
 * confidently wrong (M3.2), so it surfaces as `facts_status = 'failed'`, which
 * is retryable and visible, rather than as a number nobody can trust. Identical
 * numbers repeated are just a duplicate and collapse quietly.
 */
export function dedupeFactsByKey(facts: XbrlFact[]): XbrlFact[] {
  const groups = new Map<string, XbrlFact[]>()
  for (const f of facts) {
    const key = `${f.concept}|${f.periodStart ?? ''}|${f.periodEnd ?? ''}`
    groups.set(key, [...(groups.get(key) ?? []), f])
  }

  const out: XbrlFact[] = []
  // Array.from over a spread for the same reason filings.ts uses it: this
  // repo's tsconfig target predates iterating a Map directly.
  for (const [key, group] of Array.from(groups.entries())) {
    if (group.length === 1) {
      out.push(group[0])
      continue
    }
    const values = Array.from(
      new Set(group.map((f: XbrlFact) => (f.value !== null ? String(f.value) : (f.metadata.text ?? ''))))
    )
    if (group.some((f: XbrlFact) => f.value !== null) && values.length > 1) {
      throw new Error(
        `xbrl: ${key} carries ${values.length} different numeric values (${values.join(', ')}) — ` +
          `ambiguous, not merged`
      )
    }
    out.push({
      ...group[0],
      metadata: { ...group[0].metadata, ...(values.length > 1 ? { values: values.join(' | ') } : {}) },
    })
  }
  return out
}

export async function persistFilingFacts(
  db: FactsDb,
  args: { mayaReportId: number; companyId: string; facts: XbrlFact[] }
): Promise<void> {
  if (args.facts.length === 0) return
  const rows = dedupeFactsByKey(args.facts).map((f) => ({
    maya_report_id: args.mayaReportId,
    company_id: args.companyId,
    concept: f.concept,
    value: f.value,
    currency: f.currency,
    period_start: f.periodStart,
    period_end: f.periodEnd,
    metadata: Object.keys(f.metadata).length ? f.metadata : null,
  }))
  const { error } = await db
    .from('filing_facts')
    .upsert(rows, { onConflict: 'maya_report_id,concept,period_start,period_end' })
  if (error) throw new Error(`filing_facts upsert failed: ${error.message}`)
}
