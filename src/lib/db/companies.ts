import 'server-only'
import { matchRank } from '@/lib/company/matchRank'
import { supabaseAdmin } from '@/lib/supabase'
import type { Company, CompanyLite } from '@/lib/api/types'

const COLS =
  'id, name, display_name, name_en, tase_security_id, tase_issuer_id, sector, sub_sector, logo_url, description, website'

type Row = Record<string, unknown>

// Re-exported from `lib/company/logo.ts`, which is pure and therefore TESTED.
// It lived here, behind this file's `server-only` import, where no test could
// reach it — and the name-substring guess it used to contain put one company's
// brand mark on another for months without failing a single gate. See that
// file for the measurement and the rule.
import { resolveCompanyLogo } from '@/lib/company/logo'
export { resolveCompanyLogo }

function mapCompany(r: Row): Company {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    displayName: String(r.display_name ?? r.name ?? ''),
    nameEn: (r.name_en as string) ?? null,
    ticker: (r.tase_security_id as string) ?? null,
    // Already selected by COLS and previously dropped here. The catalog lists a
    // company's filings BY ISSUER ID, which is not the ticker (docs/MAYA-API.md).
    taseIssuerId: (r.tase_issuer_id as string) ?? null,
    sector: (r.sector as string) ?? null,
    subSector: (r.sub_sector as string) ?? null,
    logoUrl: resolveCompanyLogo(r),
    description: (r.description as string) ?? null,
    website: (r.website as string) ?? null,
  }
}

export function toCompanyLite(c: Company): CompanyLite {
  return {
    id: c.id,
    name: c.name,
    displayName: c.displayName,
    nameEn: c.nameEn,
    logoUrl: c.logoUrl,
    ticker: c.ticker,
  }
}

export async function listCompanies(): Promise<Company[]> {
  const { data, error } = await supabaseAdmin.from('companies').select(COLS).order('display_name')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapCompany)
}

export async function getCompany(id: string): Promise<Company | null> {
  const { data, error } = await supabaseAdmin.from('companies').select(COLS).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapCompany(data as Row) : null
}

export async function getCompanyByTicker(ticker: string): Promise<Company | null> {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select(COLS)
    .eq('tase_security_id', ticker)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapCompany(data as Row) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// A COMPANY ROW FOR AN ISSUER ATLAS HAS NEVER SEEN.
//
// The founder's coverage decision (2026-08-06) was all ~233 TASE reporters, not
// the four Atlas happens to hold, so asking for גילת's deck has to work the
// first time. `companies` can no longer be a hand-curated list.
//
// SHARED CORPUS: the row belongs to nobody, and this writes through
// `supabaseAdmin` like the rest of this module. Which companies exist on the
// exchange is the same fact for every member (`docs/DATA-MODEL.md`), and
// inventing an owner column here would contradict it.
//
// IDEMPOTENT BY NECESSITY — two analysts asking for the same new company at the
// same moment must end up with one row.
// ─────────────────────────────────────────────────────────────────────────────

/** Same normalisation the MAYA layer uses, so "תיגבור קבוצה" and "קבוצת תיגבור בע\"מ" meet. */
function normalise(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/["'`׳״‘’“”]/g, '')
    .replace(/(^|\s)(בעמ|בע מ)(?=\s|$)/g, ' ')
    .replace(/\b(ltd|limited|inc|corp|plc|co)\b/gi, ' ')
    .replace(/[.,;:()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * The company id for a MAYA issuer, creating the row if Atlas has none.
 *
 * Narrowest match first, and the order is load-bearing: the issuer id is an
 * exact fact and a name is a guess, so matching on name first would risk
 * attaching one company's annual report to another that merely reads alike.
 */
export async function ensureCompanyForIssuer(issuerId: number, issuerName: string): Promise<string> {
  const id = String(issuerId)

  // 1. the exact fact
  const byIssuer = await supabaseAdmin
    .from('companies')
    .select('id')
    .eq('tase_issuer_id', id)
    .limit(1)
    .maybeSingle()
  if (byIssuer.error) throw new Error(`company lookup failed: ${byIssuer.error.message}`)
  if (byIssuer.data) return String(byIssuer.data.id)

  // 2. a company Atlas already holds under this name but with no issuer id.
  //    All four existing rows are in exactly that state, so this is the normal
  //    path today rather than a fallback — and it BACKFILLS the id instead of
  //    creating a second Tigbur.
  const all = await supabaseAdmin.from('companies').select('id, name, name_en, display_name')
  if (all.error) throw new Error(`company scan failed: ${all.error.message}`)

  const target = normalise(issuerName)
  const match = (all.data ?? []).find((c) => {
    const names = [c.name, c.name_en, c.display_name]
      .filter((v): v is string => typeof v === 'string' && !!v)
      .map(normalise)
    return names.some((n) => n === target || n.includes(target) || target.includes(n))
  })

  if (match) {
    const upd = await supabaseAdmin
      .from('companies')
      .update({ tase_issuer_id: id })
      .eq('id', String(match.id))
    if (upd.error) throw new Error(`company backfill failed: ${upd.error.message}`)
    return String(match.id)
  }

  // 3. genuinely new
  const ins = await supabaseAdmin
    .from('companies')
    .insert({ name: issuerName, display_name: issuerName, tase_issuer_id: id })
    .select('id')
    .single()

  if (ins.error || !ins.data) {
    // Another request may have inserted it between the scan and this insert.
    // Losing that race is not an error — it is the other request having done
    // our work — so re-read before failing.
    const retry = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('tase_issuer_id', id)
      .limit(1)
      .maybeSingle()
    if (retry.data) return String(retry.data.id)
    throw new Error(`company insert failed: ${ins.error?.message ?? 'unknown'}`)
  }

  return String(ins.data.id)
}

export async function searchCompanies(q: string): Promise<Company[]> {
  // Strip characters that are syntactically meaningful inside a PostgREST `.or()` filter
  // (comma = clause separator, parens = grouping, `*`/`%` = wildcards) so user input can't
  // break or alter the query.
  const term = q
    .trim()
    .replace(/[,()*%]/g, ' ')
    .trim()
  if (!term) return listCompanies()
  const like = `%${term}%`

  // THE ALIAS TABLE IS PART OF THE SEARCH (ticket 07, spec §2.3 "@company
  // autocomplete from the alias table").
  //
  // Before this, the model and the user disagreed about what a company is called.
  // `resolve_company` reads `company_aliases`, so typing בז"א into a QUESTION
  // resolved off the alias table and scoped retrieval correctly — the MUST-PASS
  // eval case. Typing the same three characters into the @-mention dropdown
  // matched `companies.name` only, found nothing, and offered the user no way to
  // pin the company they had just named. The autocomplete was strictly less able
  // to recognise a company than the answer engine behind it, which reads to the
  // user as Atlas not knowing a company it demonstrably knows.
  //
  // ORDERING IS BY MATCH QUALITY, NOT BY WHICH QUERY FOUND IT (cold review).
  //
  // The first version put every alias hit in front and then `.slice(0, 20)`. A
  // broad Hebrew stem — "בנק" is the realistic one — matches twenty aliases and
  // evicted the company whose NAME the user had typed exactly. Ranking by the
  // source of the match is a proxy for relevance (M3.2); the fact that decides
  // relevance is how well the typed term matches, so that is what is measured.
  const [aliasHits, nameHits] = await Promise.all([
    supabaseAdmin.from('company_aliases').select('company_id, alias').ilike('alias', like).limit(20),
    supabaseAdmin
      .from('companies')
      .select(COLS)
      .or(
        `name.ilike.${like},display_name.ilike.${like},name_en.ilike.${like},tase_security_id.ilike.${like}`
      )
      .limit(20),
  ])
  if (nameHits.error) throw new Error(nameHits.error.message)

  const byName = (nameHits.data ?? []).map(mapCompany)
  // An alias lookup that FAILED must not silently narrow the dropdown to the name
  // matches while looking like a complete result (app.md — degradation must be
  // visible). There is no per-row channel to say "partial" on an autocomplete, so
  // the honest move is to fail the request the caller can already render an error
  // for, rather than quietly answering a different question.
  if (aliasHits.error) throw new Error(aliasHits.error.message)

  // Which aliases each company matched on — needed to score an alias-only hit,
  // since its `Company` row carries no text the term appears in.
  const aliasesByCompany = new Map<string, string[]>()
  for (const row of aliasHits.data ?? []) {
    const id = String(row.company_id)
    const list = aliasesByCompany.get(id)
    if (list) list.push(String(row.alias))
    else aliasesByCompany.set(id, [String(row.alias)])
  }

  const missing = Array.from(aliasesByCompany.keys()).filter((id) => !byName.some((c) => c.id === id))
  let candidates = byName
  if (missing.length > 0) {
    const extra = await supabaseAdmin.from('companies').select(COLS).in('id', missing).limit(20)
    if (extra.error) throw new Error(extra.error.message)
    candidates = [...byName, ...(extra.data ?? []).map(mapCompany)]
  }

  return candidates
    .map((c, i) => ({
      c,
      // Stable-sort tiebreak: `Array.prototype.sort` is stable in modern V8, but
      // saying so in the comparator costs one field and removes the doubt.
      i,
      rank: matchRank(term, [
        c.displayName,
        c.name,
        c.nameEn,
        c.ticker,
        ...(aliasesByCompany.get(c.id) ?? []),
      ]),
    }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, 20)
    .map((r) => r.c)
}
