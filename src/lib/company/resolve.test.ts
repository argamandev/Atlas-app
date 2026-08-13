import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCompany, type CompanyAliasRow } from './resolve'

// Alias rows shaped exactly like the seeded `company_aliases` table, with the
// REAL strings read off the live `companies` table on 2026-08-13. The two
// refineries matter most: בז"א (issuer 1361, בית זיקוק אשדוד) and בז"ן
// (issuer 259, בתי זיקוק) are DIFFERENT companies, the corpus holds documents
// of both, and conflating them is the exact defect eval case 14 guards.
const ASHDOD = 'company-ashdod-1361'
const BAZAN = 'company-bazan-259'
const TIGBUR = 'company-tigbur-1460'
const DORAL = 'company-doral-1801'

const ROWS: CompanyAliasRow[] = [
  { companyId: TIGBUR, alias: 'קבוצת תיגבור בע"מ', kind: 'registered' },
  { companyId: TIGBUR, alias: 'תיגבור', kind: 'registered' },
  { companyId: TIGBUR, alias: 'Tigbur Group', kind: 'latin' },
  { companyId: TIGBUR, alias: '1105022', kind: 'ticker' },
  { companyId: ASHDOD, alias: 'בית זיקוק אשדוד', kind: 'registered' },
  { companyId: ASHDOD, alias: 'בז"א', kind: 'abbreviation' },
  { companyId: BAZAN, alias: 'בתי זיקוק', kind: 'registered' },
  { companyId: BAZAN, alias: 'בז"ן', kind: 'abbreviation' },
  { companyId: BAZAN, alias: 'ORL', kind: 'latin' },
  { companyId: DORAL, alias: 'דוראל אנרגיה', kind: 'registered' },
]

// ── the MUST-PASS gate (eval case 14) ────────────────────────────────────────
test('בז"א resolves to בית זיקוק אשדוד — and never to בתי זיקוק', () => {
  assert.equal(resolveCompany('בז"א', ROWS), ASHDOD)
})

test('בז"ן resolves to בתי זיקוק — the two refineries stay distinct (case 09)', () => {
  assert.equal(resolveCompany('בז"ן', ROWS), BAZAN)
})

// Users type gershayim in several Unicode flavours, or drop them entirely.
test('every quote flavour of an acronym is the same acronym', () => {
  assert.equal(resolveCompany('בז״א', ROWS), ASHDOD) // Hebrew gershayim U+05F4
  assert.equal(resolveCompany("בז'א", ROWS), ASHDOD)
  assert.equal(resolveCompany('בזא', ROWS), ASHDOD)
  assert.equal(resolveCompany('בזן', ROWS), BAZAN)
})

// ── exact resolution across alias kinds ──────────────────────────────────────
test('registered names resolve with or without corporate noise', () => {
  assert.equal(resolveCompany('קבוצת תיגבור בע"מ', ROWS), TIGBUR)
  assert.equal(resolveCompany('קבוצת תיגבור', ROWS), TIGBUR)
  assert.equal(resolveCompany('  תיגבור  ', ROWS), TIGBUR)
  assert.equal(resolveCompany('בית זיקוק אשדוד', ROWS), ASHDOD)
  assert.equal(resolveCompany('בתי זיקוק', ROWS), BAZAN)
})

test('latin names resolve case-insensitively', () => {
  assert.equal(resolveCompany('Tigbur Group', ROWS), TIGBUR)
  assert.equal(resolveCompany('tigbur group', ROWS), TIGBUR)
  assert.equal(resolveCompany('orl', ROWS), BAZAN)
})

test('a ticker resolves exactly', () => {
  assert.equal(resolveCompany('1105022', ROWS), TIGBUR)
})

// ── the coverage pass: partial names that fully identify one company ─────────
test('a distinctive fragment of a longer name resolves', () => {
  assert.equal(resolveCompany('דוראל', ROWS), DORAL)
  assert.equal(resolveCompany('זיקוק אשדוד', ROWS), ASHDOD)
})

test('a fragment shared by two companies resolves to neither', () => {
  // Both refineries carry זיקוק — a coin-flip here is the wrong company's
  // filings arriving under the name the analyst asked for.
  assert.equal(resolveCompany('זיקוק', ROWS), null)
})

test('a query made only of industry words identifies nothing', () => {
  assert.equal(resolveCompany('אנרגיה', ROWS), null)
  assert.equal(resolveCompany('קבוצת', ROWS), null)
})

// ── honest nulls ─────────────────────────────────────────────────────────────
test('an unknown company is null, not a nearest guess', () => {
  assert.equal(resolveCompany('טבע', ROWS), null)
  assert.equal(resolveCompany('חברה שלא קיימת', ROWS), null)
  assert.equal(resolveCompany('', ROWS), null)
  assert.equal(resolveCompany('   ', ROWS), null)
})

test('a one-letter query never resolves', () => {
  assert.equal(resolveCompany('א', ROWS), null)
  assert.equal(resolveCompany('ד', ROWS), null)
})

test('an alias duplicated across two companies is ambiguous, so null', () => {
  const poisoned: CompanyAliasRow[] = [
    ...ROWS,
    // Same normalized form as ORL under a different company — a seeding
    // mistake must degrade to silence at runtime, never to a coin-flip.
    { companyId: TIGBUR, alias: 'orl', kind: 'abbreviation' },
  ]
  assert.equal(resolveCompany('ORL', poisoned), null)
})
