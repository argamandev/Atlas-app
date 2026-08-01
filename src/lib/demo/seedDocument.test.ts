import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seedHtml } from './seedDocument'
import { en } from '@/lib/i18n/dictionaries/en'
import { he } from '@/lib/i18n/dictionaries/he'

// These guard the branch's most dangerous element: a fabricated Hebrew quote
// attributed to a NAMED executive of a real TASE issuer. Two review rounds were
// spent on its marker — once for being English-only and deletable, once for being
// absent from anything that captured the quote on its own. Both are asserted here
// so a third round is a failing test rather than a review finding.

const LOCALES = [
  ['en', en],
  ['he', he],
] as const

for (const [name, dict] of LOCALES) {
  test(`[${name}] the fabricated quote carries a marker in its own locale`, () => {
    const html = seedHtml(dict)
    assert.ok(
      html.includes(dict.demo.inlineLabel),
      `the ${name} demo label must appear in the seeded document`
    )
    assert.ok(html.includes(dict.demo.inlineHint), `the ${name} demo hint must appear in the seeded document`)
  })

  test(`[${name}] the marker is INSIDE the attribution line, so it travels with the quote`, () => {
    const html = seedHtml(dict)
    const start = html.indexOf('<blockquote')
    const end = html.indexOf('</blockquote>')
    assert.ok(start !== -1 && end > start, 'the seeded document must contain a blockquote')

    const block = html.slice(start, end)
    // The whole point: a marker above the body is dropped by anything that captures
    // only the quote (a clipped print, a copy-paste). This one cannot be.
    assert.ok(
      block.includes(dict.demo.inlineLabel),
      `the ${name} marker must live inside the blockquote, not merely somewhere on the page`
    )

    // Reviewer NIT, round 3: asserting `<cite>` merely EXISTS let the marker sit on a
    // sibling <p> and still pass. The claim is that the marker rides on the attribution
    // line, so scope the assertion to the <cite> itself.
    const cite = block.slice(block.indexOf('<cite'), block.indexOf('</cite>'))
    assert.ok(cite.length > 0, 'the quote must carry an attribution line')
    assert.ok(
      cite.includes(dict.demo.inlineLabel) && cite.includes(dict.demo.inlineHint),
      `the ${name} marker must be in the <cite>, not merely somewhere in the blockquote`
    )
  })

  test(`[${name}] mixed-direction runs in the attribution are bdi-isolated`, () => {
    // `dir="auto"` resolves from the FIRST strong character — the Hebrew name — so an
    // un-isolated English marker rendered right-aligned with its final period orphaned
    // to the visual start of the line. Iron rule 5. Same remedy as the "sheets 4" fix.
    const html = seedHtml(dict)
    const cite = html.slice(html.indexOf('<cite'), html.indexOf('</cite>'))
    assert.ok(cite.includes(`<bdi>${dict.demo.inlineLabel}`), 'the marker run must be isolated')
    assert.ok(cite.includes('<bdi>CEO</bdi>'), 'the Latin role run must be isolated')
    assert.ok(cite.includes('<bdi>מוטי בן־ארי</bdi>'), 'the Hebrew name run must be isolated')
  })
}

test('the two locales really do produce different marker text', () => {
  // Guards the exact round-1 defect: a hardcoded English marker looks correct in
  // English review and leaves Hebrew readers with nothing.
  assert.notEqual(en.demo.inlineLabel, he.demo.inlineLabel)
  assert.ok(!seedHtml(he).includes(en.demo.inlineHint))
  assert.ok(!seedHtml(en).includes(he.demo.inlineHint))
})

test('the attribution still names its fabricated source, so the marker has something to qualify', () => {
  // If the quote block is ever rewritten without a cite, the markers above become
  // decoration on nothing — fail loudly rather than pass vacuously.
  const html = seedHtml(en)
  const cite = html.slice(html.indexOf('<cite'), html.indexOf('</cite>'))
  assert.ok(cite.includes('CEO'), 'the fabricated attribution must still name a role')
  assert.ok(cite.includes('מוטי בן־ארי'), 'the fabricated attribution must still name its speaker')
})
