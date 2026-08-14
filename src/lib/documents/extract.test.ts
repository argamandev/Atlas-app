import { test } from 'node:test'
import assert from 'node:assert/strict'
import {reassemblePage, pgSafe } from './extract'

// Spike case 1 (demo-report.pdf p1, y=152): stream order emitted "שהסתיימה ביום" before
// "לשנה" although לשנה (x=476) reads FIRST in RTL. Descending-x must fix it.
test('within-line RTL swap is fixed by descending-x order', () => {
  const items = [
    { str: 'שהסתיימה ביום', x: 382, y: 152 },
    { str: 'לשנה', x: 476, y: 152 },
    { str: '31', x: 361, y: 152 },
    { str: 'בדצמבר', x: 313, y: 152 },
    { str: '2025', x: 278, y: 152 },
  ]
  assert.equal(reassemblePage(items), 'לשנה שהסתיימה ביום 31 בדצמבר 2025')
})

// Spike case 2 (p1, y=122): digits render LTR — "3"(x=492) then "0"(x=499) must stay "3 0"
// (ascending x), not flip to "0 3" under the RTL sort.
test('LTR digit runs keep ascending-x order inside an RTL line', () => {
  const items = [
    { str: '3', x: 492, y: 122 },
    { str: '0', x: 499, y: 122 },
    { str: 'במרץ', x: 461, y: 122 },
    { str: '2026', x: 431, y: 122 },
  ]
  assert.equal(reassemblePage(items), '3 0 במרץ 2026')
})

// Spike case 3: "-" between digit groups must NOT break the LTR run — the reference number
// 2026-01-029201 reads left-to-right as a whole (naive run-breaking reversed it).
test('hyphenated reference numbers stay in LTR order', () => {
  const items = [
    { str: "(מס' אסמכתא:", x: 353, y: 122 },
    { str: '2026', x: 265, y: 122 },
    { str: '-', x: 291, y: 122 },
    { str: '01', x: 295, y: 122 },
    { str: '-', x: 308, y: 122 },
    { str: '029201', x: 312, y: 122 },
    { str: ')', x: 261, y: 122 },
  ]
  assert.equal(reassemblePage(items), "(מס' אסמכתא: 2026 - 01 - 029201 )")
})

test('lines order top-to-bottom (PDF y grows upward)', () => {
  const items = [
    { str: 'שורה תחתונה', x: 400, y: 100 },
    { str: 'שורה עליונה', x: 400, y: 700 },
  ]
  assert.equal(reassemblePage(items), 'שורה עליונה\nשורה תחתונה')
})

test('empty page yields empty string', () => {
  assert.equal(reassemblePage([]), '')
})

test('near-y items group into one line (rounding jitter)', () => {
  const items = [
    { str: 'מילה', x: 450, y: 152.4 },
    { str: 'שנייה', x: 400, y: 151.8 },
  ]
  assert.equal(reassemblePage(items), 'מילה שנייה')
})

// ── pgSafe — what Postgres cannot store never leaves extraction ──────────────
//
// Measured in the A5 backfill: 2 of the first 401 documents failed with
// "unsupported Unicode escape sequence" on the pages insert. One NUL anywhere in
// a 300-page filing loses the WHOLE document — visibly `failed`, retryable, but
// absent from search until someone notices.

test('a NUL is stripped, and the rest of the page survives intact', () => {
  const nul = String.fromCharCode(0)
  assert.equal(pgSafe(`דוח${nul} תקופתי`), 'דוח תקופתי')
  assert.equal(pgSafe(`${nul}${nul}2026`), '2026')
})

test('ordinary Hebrew, Latin, digits and punctuation are untouched', () => {
  // The strip must not become a sanitiser: this text is quoted back to analysts
  // verbatim as a citation, so anything it removes is a lie in a source_quote.
  const real = 'ההכנסות ברבעון היו 358.7 מיליון ש"ח (Q1 2026) — עלייה של 12%'
  assert.equal(pgSafe(real), real)
})

test('a real emoji or other astral character keeps BOTH halves of its pair', () => {
  // Surrogate pairs are valid UTF-16 and encode fine; only LONE surrogates break.
  // A rule that dropped every 0xD800-0xDFFF code unit would silently mangle any
  // astral character in a filing.
  const astral = 'נתונים 𝟚𝟘𝟚𝟞 ok'
  assert.equal(pgSafe(astral), astral)
})

test('a LONE surrogate is dropped — it survives JSON and breaks the UTF-8 encode', () => {
  const lone = 'abc' + String.fromCharCode(0xd800) + 'def'
  assert.equal(pgSafe(lone), 'abcdef')
  const loneLow = 'abc' + String.fromCharCode(0xdc00) + 'def'
  assert.equal(pgSafe(loneLow), 'abcdef')
})
