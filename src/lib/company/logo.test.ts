import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCompanyLogo } from './logo'

test('a stored logo_url always wins', () => {
  assert.equal(
    resolveCompanyLogo({ logo_url: 'https://mayafiles.tase.co.il/logos/he-IL/001096.jpg' }),
    'https://mayafiles.tase.co.il/logos/he-IL/001096.jpg'
  )
})

test('a bundled logo resolves by EXACT security id', () => {
  assert.equal(resolveCompanyLogo({ tase_security_id: '1105022' }), '/logos/tigbur.jpg')
  // תמיס has no logo_url and no MAYA issuer id; the exact-id map is the only
  // thing keeping its logo, which is why deleting the name matching cost nothing.
  assert.equal(resolveCompanyLogo({ tase_security_id: '1097229' }), '/logos/tamis.png')
})

test('a company we have no logo for gets NULL, so the UI draws its monogram', () => {
  assert.equal(resolveCompanyLogo({ name: 'פרוספקט' }), null)
  assert.equal(resolveCompanyLogo({}), null)
  assert.equal(resolveCompanyLogo({ logo_url: '' }), null)
  assert.equal(resolveCompanyLogo({ tase_security_id: '9999999' }), null)
})

// ── the merge-gating regression ──────────────────────────────────────────────
// A two-letter substring match on the Hebrew name used to hand one company
// another's brand mark. Measured against the live DB: of the 14 rows with no
// logo, exactly one matched. These are named, not looped, because the point is
// the specific pair that was wrong on a live site.

test('ארגו פרופרטיז never wears רג"א\'s logo', () => {
  assert.equal(
    resolveCompanyLogo({ name: 'ארגו פרופרטיז', display_name: 'ארגו פרופרטיז' }),
    null,
    'a name containing the run רג must not resolve to /logos/rga.png'
  )
})

test('NO name — Hebrew or Latin — can select a logo', () => {
  // The general form of the same defect. Any future "helpful" name heuristic
  // fails here rather than on an investor's screen.
  const names = ['רג"א', 'ארגו פרופרטיז', 'תמיס בע"מ', 'Themis Ltd', 'תיגבור', 'Qualitau']
  for (const n of names) {
    assert.equal(
      resolveCompanyLogo({ name: n, display_name: n }),
      null,
      `"${n}" resolved a logo from its name alone`
    )
  }
})
