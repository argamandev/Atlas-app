import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAliasSeed, CURATED_ABBREVIATIONS, type CompanySeedSource } from './aliasSeed'
import { resolveCompany } from './resolve'

// Fixture shaped exactly like the live `companies` rows this seed runs over
// (read off production 2026-08-13): 234/234 have name + display_name, only 4
// have name_en, 3 have tase_security_id, 233 have tase_issuer_id.
const LIVE_SHAPED: CompanySeedSource[] = [
  {
    id: 'c-tigbur',
    name: 'קבוצת תיגבור בע"מ',
    displayName: 'תיגבור',
    nameEn: 'Tigbur Group',
    taseSecurityId: '1105022',
    taseIssuerId: '1460',
  },
  {
    id: 'c-ashdod',
    name: 'בית זיקוק אשדוד',
    displayName: 'בית זיקוק אשדוד',
    nameEn: null,
    taseSecurityId: null,
    taseIssuerId: '1361',
  },
  {
    id: 'c-bazan',
    name: 'בתי זיקוק',
    displayName: 'בתי זיקוק',
    nameEn: null,
    taseSecurityId: null,
    taseIssuerId: '259',
  },
  {
    id: 'c-doral',
    name: 'דוראל אנרגיה',
    displayName: 'דוראל אנרגיה',
    nameEn: null,
    taseSecurityId: null,
    taseIssuerId: '1801',
  },
]

test('name and display_name become registered aliases, deduped per company', () => {
  const { rows } = buildAliasSeed(LIVE_SHAPED)
  const tigbur = rows.filter((r) => r.companyId === 'c-tigbur' && r.kind === 'registered')
  assert.deepEqual(tigbur.map((r) => r.alias).sort(), ['קבוצת תיגבור בע"מ', 'תיגבור'].sort())
  // אשדוד's name === display_name — one row, not two
  const ashdod = rows.filter((r) => r.companyId === 'c-ashdod' && r.kind === 'registered')
  assert.equal(ashdod.length, 1)
})

test('name_en becomes a latin alias and tase_security_id a ticker alias', () => {
  const { rows } = buildAliasSeed(LIVE_SHAPED)
  assert.ok(rows.some((r) => r.companyId === 'c-tigbur' && r.kind === 'latin' && r.alias === 'Tigbur Group'))
  assert.ok(rows.some((r) => r.companyId === 'c-tigbur' && r.kind === 'ticker' && r.alias === '1105022'))
})

test('curated abbreviations attach by issuer id', () => {
  const { rows } = buildAliasSeed(LIVE_SHAPED)
  assert.ok(rows.some((r) => r.companyId === 'c-ashdod' && r.kind === 'abbreviation' && r.alias === 'בז"א'))
  assert.ok(rows.some((r) => r.companyId === 'c-bazan' && r.kind === 'abbreviation' && r.alias === 'בז"ן'))
  assert.ok(rows.some((r) => r.companyId === 'c-bazan' && r.kind === 'latin' && r.alias === 'ORL'))
})

test('a curated alias whose issuer is absent is reported, never guessed onto a row', () => {
  const withoutBazan = LIVE_SHAPED.filter((c) => c.id !== 'c-bazan')
  const { rows, unmatchedCurated } = buildAliasSeed(withoutBazan)
  assert.ok(!rows.some((r) => r.alias === 'בז"ן'))
  assert.ok(unmatchedCurated.includes('בז"ן'))
  assert.ok(unmatchedCurated.includes('ORL'))
})

test('an alias two companies would share is dropped from BOTH and reported', () => {
  const twins: CompanySeedSource[] = [
    ...LIVE_SHAPED,
    // Same normalized form as תיגבור's display name under another company —
    // seeding it would make the resolver coin-flip, so neither may get it.
    {
      id: 'c-impostor',
      name: 'תיגבור בע״מ',
      displayName: 'אחר',
      nameEn: null,
      taseSecurityId: null,
      taseIssuerId: '9999',
    },
  ]
  const { rows, collisions } = buildAliasSeed(twins)
  assert.ok(!rows.some((r) => r.alias === 'תיגבור'))
  assert.ok(!rows.some((r) => r.alias === 'תיגבור בע״מ'))
  assert.ok(collisions.some((c) => c.companyIds.includes('c-tigbur') && c.companyIds.includes('c-impostor')))
  // the colliding companies keep their non-colliding aliases
  assert.ok(rows.some((r) => r.companyId === 'c-tigbur' && r.alias === 'קבוצת תיגבור בע"מ'))
})

test('blank and null name fields produce no rows', () => {
  const sparse: CompanySeedSource[] = [
    { id: 'c-x', name: '  ', displayName: null, nameEn: null, taseSecurityId: null, taseIssuerId: null },
  ]
  const { rows } = buildAliasSeed(sparse)
  assert.equal(rows.length, 0)
})

test('every curated abbreviation names a real TASE issuer id', () => {
  for (const cur of CURATED_ABBREVIATIONS) {
    assert.match(cur.taseIssuerId, /^\d+$/, `${cur.alias} carries a non-numeric issuer id`)
  }
})

// ── the MUST-PASS gate, end to end and offline (eval case 14) ────────────────
test('the seeded table resolves בז"א to בית זיקוק אשדוד, offline', () => {
  const { rows } = buildAliasSeed(LIVE_SHAPED)
  assert.equal(resolveCompany('בז"א', rows), 'c-ashdod')
  assert.equal(resolveCompany('בז"ן', rows), 'c-bazan')
  assert.equal(resolveCompany('מה שהוא לא חברה', rows), null)
})
