import type { AttachableSource } from '../data'
import type { FindResult, SourceRequest } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// THE SOURCE SEAM (spec §5.1). Everything that offers material to a workspace
// arrives through this function.
//
// Today the corpus is `transcripts` + `company_documents`, fetched by the route.
// When the Maya catalog lands, its filings are concatenated into the SAME array
// by the caller and nothing in here changes — which is the whole point, and the
// reason the workspace could be built before the API key arrived.
//
// Pure on purpose: the corpus comes in as an argument, so every branch below is
// testable without a database, a network, or a signed-in user.
// ─────────────────────────────────────────────────────────────────────────────

const byNewestFirst = (a: AttachableSource, b: AttachableSource) => (b.when ?? '').localeCompare(a.when ?? '')

/**
 * Words worth matching on.
 *
 * THE MINIMUM IS THREE CHARACTERS, and that number is load-bearing rather than a
 * round guess. Hebrew's function words are two letters — של, את, עם, על, כל —
 * and at two characters "של" (of) matched INSIDE "שלישי" (third), which put a
 * different issuer's investor call into the confirm list already ticked. Found on
 * real rows in the browser, 2026-08-04.
 */
const meaningfulWords = (text: string) => tokenize(text).filter((w) => w.length >= 3)

/**
 * The haystack, as tokens — matching happens per token, never across one.
 *
 * Splitting on an explicit separator class rather than `\P{L}`: this tsconfig
 * targets below es6, where the regex `u` flag (and so unicode property escapes)
 * is unavailable. Everything not listed here — crucially every Hebrew and Latin
 * letter and every digit — survives as part of a token.
 */
const SEPARATORS = /[\s\-–—_()[\]{}<>,.;:!?"'`׳״/\\|+*=&%#@~]+/

/**
 * Hebrew's five final forms folded to their regular ones (ך ם ן ף ץ → כ מ נ פ צ).
 *
 * Not cosmetic — a letter changes shape when it stops ending the word, so
 * "רבעון" (quarter) is spelled with a final nun while "רבעוני" (quarterly) is
 * not. Without this fold, `startsWith` says the second does not begin with the
 * first, and searching for a quarter misses every quarterly report. Latin text
 * passes through untouched.
 */
const FINAL_FORMS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }

const fold = (s: string) => s.replace(/[ךםןףץ]/g, (c) => FINAL_FORMS[c])

const tokenize = (text: string) => fold(text.toLowerCase()).split(SEPARATORS).filter(Boolean)

export function findSources(request: SourceRequest, corpus: AttachableSource[]): FindResult {
  if (corpus.length === 0) {
    return { request, company: null, matched: [], otherForCompany: [], reason: 'empty-corpus' }
  }

  // ── resolve the company, if the user named one ─────────────────────────────
  // Substring in EITHER direction: the user types "תיגבור", the row says
  // "קבוצת תיגבור בע\"מ". Neither contains the other as a prefix, and demanding
  // an exact match here would make the panel answer "no such company" for the
  // one company we actually have the most of.
  let company: string | null = null
  if (request.company) {
    const needle = request.company.trim().toLowerCase()
    const names = corpus.map((s) => s.company).filter((v, i, a): v is string => !!v && a.indexOf(v) === i)
    company =
      names.find((n) => n.toLowerCase() === needle) ??
      names.find((n) => n.toLowerCase().includes(needle) || needle.includes(n.toLowerCase())) ??
      null
  }

  const pool = company ? corpus.filter((s) => s.company === company) : corpus

  const inWindow = (s: AttachableSource) => {
    if (request.fromYear === null && request.toYear === null) return true
    const y = s.when ? Number(s.when.slice(0, 4)) : NaN
    // An undated row cannot be SHOWN to fall inside the window. Including it
    // would put a file on the shelf the user did not ask for; excluding it when
    // no window was asked for would hide a real source. Hence: only here.
    if (!Number.isFinite(y)) return false
    if (request.fromYear !== null && y < request.fromYear) return false
    if (request.toYear !== null && y > request.toYear) return false
    return true
  }

  const ofKind = (s: AttachableSource) => !request.kinds || request.kinds.includes(s.kind)

  let matched = pool.filter((s) => inWindow(s) && ofKind(s))

  // With no company resolved, the user's own words are all we have. A resolved
  // company deliberately does NOT get narrowed this way — "תיגבור 2026 דוחות"
  // would otherwise drop every call whose title lacks the word "דוחות".
  if (!company) {
    const words = meaningfulWords(request.text)
    if (words.length > 0) {
      const hit = (s: AttachableSource) => {
        const tokens = tokenize(`${s.title} ${s.company ?? ''}`)
        // A word matches a token, or the START of one ("רבעון" finds "רבעוני").
        // It never matches mid-token — that is what let "של" find "שלישי".
        return words.some((w) => tokens.some((t) => t === w || t.startsWith(w)))
      }
      // Narrowing to NOTHING is a real answer and is kept. Falling back to the
      // unnarrowed pool here would hand back the entire corpus as though it
      // answered the question — the fabricated-result failure this whole slice
      // exists to remove.
      matched = matched.filter(hit)
    }
  }

  matched = [...matched].sort(byNewestFirst)

  if (matched.length === 0) {
    // A resolved company with nothing in the window is a DIFFERENT sentence from
    // "I found nothing" — the panel names the company and offers what does exist.
    if (company) {
      return {
        request,
        company,
        matched: [],
        otherForCompany: [...pool].sort(byNewestFirst),
        reason: 'company-has-nothing-in-period',
      }
    }
    return { request, company: null, matched: [], otherForCompany: [], reason: 'nothing-matched' }
  }

  return { request, company, matched, otherForCompany: [], reason: 'ok' }
}
