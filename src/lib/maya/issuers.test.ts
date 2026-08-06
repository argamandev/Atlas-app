import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveIssuer, normaliseCompanyName, type IssuerRow } from './issuers'

// Real rows, read off the live directory on 2026-08-06.
const ROWS: IssuerRow[] = [
  { issuerId: 1460, nameHe: 'תיגבור קבוצה', nameEn: 'TIGBUR GROUP' },
  { issuerId: 2030, nameHe: 'גילת', nameEn: 'GILAT' },
  { issuerId: 1328, nameHe: 'אמות', nameEn: null },
  { issuerId: 2028, nameHe: 'טאואר', nameEn: 'TOWER' },
  { issuerId: 1536, nameHe: 'לוינשטין נכסים', nameEn: null },
]

test('the corporate suffix and quote variants are noise', () => {
  assert.equal(normaliseCompanyName('קבוצת תיגבור בע"מ'), 'קבוצת תיגבור')
  assert.equal(normaliseCompanyName('קבוצת תיגבור בע״מ'), 'קבוצת תיגבור')
  assert.equal(normaliseCompanyName('  Gilat   Ltd. '), 'gilat')
})

// Hebrew construct state: "קבוצת תיגבור" and MAYA's "תיגבור קבוצה" are the same
// company, and neither string contains the other.
test('word order and construct state still find the company', () => {
  assert.equal(resolveIssuer('קבוצת תיגבור בע"מ', ROWS)?.issuerId, 1460)
})

test('a company resolves from either language and either word order', () => {
  assert.equal(resolveIssuer('תיגבור', ROWS)?.issuerId, 1460)
  assert.equal(resolveIssuer('תיגבור קבוצה', ROWS)?.issuerId, 1460)
  assert.equal(resolveIssuer('TIGBUR GROUP', ROWS)?.issuerId, 1460)
  assert.equal(resolveIssuer('tigbur group', ROWS)?.issuerId, 1460)
  assert.equal(resolveIssuer('  גילת  ', ROWS)?.issuerId, 2030)
  assert.equal(resolveIssuer('אמות', ROWS)?.issuerId, 1328)
})

test('an unknown company is null, not a nearest guess', () => {
  assert.equal(resolveIssuer('חברה שלא קיימת', ROWS), null)
  assert.equal(resolveIssuer('', ROWS), null)
  assert.equal(resolveIssuer('   ', ROWS), null)
})

// ATTACHING THE WRONG COMPANY'S REPORT IS A WRONG ANSWER THAT LOOKS RIGHT.
test('a fragment matching two issuers resolves to neither', () => {
  const ambiguous: IssuerRow[] = [
    { issuerId: 1, nameHe: 'בנק לאומי', nameEn: null },
    { issuerId: 2, nameHe: 'בנק הפועלים', nameEn: null },
  ]
  assert.equal(resolveIssuer('בנק', ambiguous), null)
  // ...but the full name still resolves
  assert.equal(resolveIssuer('בנק לאומי', ambiguous)?.issuerId, 1)
})

test('a one-letter query never substring-matches the market', () => {
  assert.equal(resolveIssuer('א', ROWS), null)
  assert.equal(resolveIssuer('ג', ROWS), null)
})

// ── the review's counter-examples, 2026-08-06 ────────────────────────────────
// The original "shares a distinctive word" rule resolved THREE different real
// TASE companies to a fourth, because Israeli corporate names are built out of
// a small set of industry nouns and נכסים happened to be unique in the rows
// being searched. A confidently wrong company is this module's worst outcome:
// it is not an error the analyst can see, it is another company's annual report
// arriving under the name they asked for — and on agreement it writes into
// shared corpus.
test('a shared industry word never resolves a company', () => {
  for (const q of ['אלוני חץ נכסים', 'נכסים ובנין', 'מבני תעשיה נכסים']) {
    assert.equal(resolveIssuer(q, ROWS), null, `${q} must not resolve to לוינשטין נכסים`)
  }
  // ...and a query that is ONLY industry words identifies nothing at all
  assert.equal(resolveIssuer('נכסים', ROWS), null)
  assert.equal(resolveIssuer('קבוצת אחזקות בע"מ', ROWS), null)
})

// A longer name is not the same company as the short one it contains.
test('extra identifying words mean a different company, not a near miss', () => {
  assert.equal(resolveIssuer('גילת שירותי בריאות', ROWS), null)
  // the plain name still resolves
  assert.equal(resolveIssuer('גילת', ROWS)?.issuerId, 2030)
})

test('the real directory shape still resolves what it should', () => {
  assert.equal(resolveIssuer('לוינשטין נכסים', ROWS)?.issuerId, 1536)
  assert.equal(resolveIssuer('לוינשטין', ROWS)?.issuerId, 1536)
  assert.equal(resolveIssuer('טאואר', ROWS)?.issuerId, 2028)
})
