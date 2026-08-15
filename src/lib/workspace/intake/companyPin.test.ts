import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveIntakeCompany } from './companyPin'
import type { IssuerRow } from '@/lib/maya/issuers'

/**
 * The five states of "which company is this turn about", swept.
 *
 * The two refineries are the fixture on purpose: they are the pair this whole
 * feature was built out of. `בז"א` (1361) and `בז"ן` (259) share the words a
 * matcher sees, which is why the name path returns null for the abbreviation
 * the founder actually typed and why the pin path exists at all.
 */
const ROWS: IssuerRow[] = [
  { issuerId: 1361, nameHe: 'בית זיקוק אשדוד', nameEn: null },
  { issuerId: 259, nameHe: 'בתי זיקוק', nameEn: null },
  { issuerId: 1105022, nameHe: 'קבוצת תיגבור', nameEn: 'Tigbur Group' },
]

test('a pin with an issuer id is the answer, whatever the sentence said', () => {
  const out = resolveIntakeCompany({ taseIssuerId: '1361', name: 'בית זיקוק אשדוד' }, 'תיגבור', ROWS)
  assert.deepEqual(out, { issuerId: 1361, unknownCompany: null, settled: true })
})

test("a pin answers where the typed name cannot — the founder's own case", () => {
  // The abbreviation resolves to nothing against MAYA's registered names…
  assert.deepEqual(resolveIntakeCompany(null, 'בז"א', ROWS), {
    issuerId: null,
    unknownCompany: 'בז"א',
    settled: false,
  })
  // …and to 1361 the moment it is a pin instead of a spelling.
  assert.equal(
    resolveIntakeCompany({ taseIssuerId: '1361', name: 'בית זיקוק אשדוד' }, 'בז"א', ROWS).issuerId,
    1361
  )
})

test('a pinned company with no issuer id is NAMED as unreachable, not silently dropped', () => {
  for (const taseIssuerId of [null, '', 'abc', '0', '-4']) {
    assert.deepEqual(
      resolveIntakeCompany({ taseIssuerId, name: 'חברה בלי מנפיק' }, null, ROWS),
      { issuerId: null, unknownCompany: 'חברה בלי מנפיק', settled: true },
      `taseIssuerId=${JSON.stringify(taseIssuerId)} must not search, and must say which company`
    )
  }
})

test('no pin, a name that resolves', () => {
  assert.deepEqual(resolveIntakeCompany(null, 'בית זיקוק אשדוד', ROWS), {
    issuerId: 1361,
    unknownCompany: null,
    settled: true,
  })
})

test('no pin, an AMBIGUOUS name is unknown — never a coin flip between the refineries', () => {
  const out = resolveIntakeCompany(null, 'זיקוק', ROWS)
  assert.equal(out.issuerId, null)
  assert.equal(out.unknownCompany, 'זיקוק')
})

test('no pin and no company named: nothing to search, and nothing to complain about', () => {
  assert.deepEqual(resolveIntakeCompany(null, null, ROWS), {
    issuerId: null,
    unknownCompany: null,
    settled: false,
  })
})

/**
 * `settled` is what the route gates the "I couldn't work out which company you
 * meant" notice on. It must be TRUE on every path where a company was decided —
 * including the pinned-but-unreachable one, where the analyst is told something
 * more specific instead — and FALSE only where no company was established.
 */
test('settled is true exactly when a company was decided', () => {
  const settled = [
    resolveIntakeCompany({ taseIssuerId: '259', name: 'בתי זיקוק' }, null, ROWS),
    resolveIntakeCompany({ taseIssuerId: null, name: 'בתי זיקוק' }, null, ROWS),
    resolveIntakeCompany(null, 'תיגבור', ROWS),
  ]
  for (const s of settled) assert.equal(s.settled, true)

  const unsettled = [resolveIntakeCompany(null, null, ROWS), resolveIntakeCompany(null, 'בז"א', ROWS)]
  for (const u of unsettled) assert.equal(u.settled, false)
})
