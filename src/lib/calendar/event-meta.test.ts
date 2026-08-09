import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventKind, kindLabel, kindFill, EVENT_KIND_META, EVENT_KINDS } from './event-meta'

test('eventKind defaults to call for plain scheduled calls (no kind hint)', () => {
  assert.equal(eventKind({}), 'call')
  assert.equal(eventKind({ kind: null }), 'call')
  assert.equal(eventKind({ kind: 'nonsense' }), 'call')
})

test('eventKind honors explicit report/webinar hints', () => {
  assert.equal(eventKind({ kind: 'report' }), 'report')
  assert.equal(eventKind({ kind: 'webinar' }), 'webinar')
})

test('every kind carries an accent, a tint and a dictionary label key', () => {
  for (const k of EVENT_KINDS) {
    assert.match(EVENT_KIND_META[k].accent, /^#[0-9A-F]{6}$/i)
    assert.match(EVENT_KIND_META[k].tint, /^#[0-9A-F]{6}$/i)
    assert.ok(EVENT_KIND_META[k].labelKey.length > 0)
  }
})

// ── the colours ──────────────────────────────────────────────────────────────
// Pinning the literals would only re-state the source file. What is worth
// defending is the PROPERTY the founder actually asked for on 2026-08-09 — that
// the kinds are told apart at a glance — and the specific way it was nearly
// broken: calls were about to take the blue that webinars already had.

test('no two kinds share a colour', () => {
  assert.equal(new Set(EVENT_KINDS.map((k) => EVENT_KIND_META[k].accent)).size, EVENT_KINDS.length)
  assert.equal(new Set(EVENT_KINDS.map((k) => EVENT_KIND_META[k].tint)).size, EVENT_KINDS.length)
})

// HSL, because the defect was invisible in RGB and in hue alone.
function hsl(hex: string): { h: number; s: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0 }
  const raw = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  const h = (raw * 60 + 360) % 360
  return { h, s: d / (1 - Math.abs(2 * l - 1)) }
}

/**
 * ⚠ WHY THE THRESHOLD IS SATURATION AND NOT ONLY HUE — I wrote the hue check
 * first, and it was WORTHLESS: the palette it was supposed to reject passes it
 * at 50° apart. Hue is an angle on a wheel that means nothing once a colour is
 * grey, and greys are exactly what the old palette was — measured saturation
 * 6% (call, #3A3833), 11% (report), 15% (webinar). The founder was not confusing
 * two hues, he was looking at three dark neutrals.
 *
 * So the guard checks saturation FIRST. Current palette measures 54% / 25% / 52%,
 * so 20% sits between the two sets with the nearest live value 5 points clear —
 * a real but thin margin, stated here rather than hidden behind a round number.
 * A future "let's tone these down" that reaches grey again fails this test.
 */
const MIN_SATURATION = 0.2
const MIN_HUE_SEPARATION = 45

test('each accent is a colour, not a grey', () => {
  for (const k of EVENT_KINDS) {
    const { s } = hsl(EVENT_KIND_META[k].accent)
    assert.ok(
      s >= MIN_SATURATION,
      `${k} accent ${EVENT_KIND_META[k].accent} is ${(s * 100).toFixed(0)}% saturated — that is a grey, and three greys are what the founder could not tell apart`
    )
  }
})

test('the kinds sit in different hue families, not just different shades', () => {
  const separation = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360
    return d > 180 ? 360 - d : d
  }
  const hues = EVENT_KINDS.map((k) => hsl(EVENT_KIND_META[k].accent).h)
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      const apart = separation(hues[i]!, hues[j]!)
      assert.ok(
        apart >= MIN_HUE_SEPARATION,
        `${EVENT_KINDS[i]} and ${EVENT_KINDS[j]} are ${apart.toFixed(0)}° apart — too close to tell apart`
      )
    }
  }
})

test('the guard rejects the palette it replaced', () => {
  // A guard that passes the bug it was written for is worse than none. The old
  // accents are pinned HERE, in the one place they still serve a purpose.
  const OLD = { call: '#3A3833', report: '#6E7B63', webinar: '#67788A' }
  const greys = Object.entries(OLD).filter(([, hex]) => hsl(hex).s < MIN_SATURATION)
  assert.equal(greys.length, 3, 'all three old accents must fail the saturation floor')
})

test('kindFill is a vertical gradient — a horizontal one would flip meaning in RTL', () => {
  for (const k of EVENT_KINDS) {
    const fill = kindFill(k)
    assert.ok(fill.includes('to bottom'), `${k} fill must run top-to-bottom`)
    assert.ok(!/to (right|left)/.test(fill), `${k} fill must not run along the inline axis`)
    assert.ok(fill.includes(EVENT_KIND_META[k].tint), `${k} fill must use its own tint`)
  }
})

// ── the shared singular label ────────────────────────────────────────────────
// This exists because Home hardcoded "investor call" for every upcoming row, so
// 99 report-publication dates each announced a call nobody had scheduled. Three
// surfaces render this string; the point of the function is that they cannot
// disagree, so the test names each kind rather than looping.

const D = { ctxKindCall: 'Investor call', ctxKindReport: 'Report', ctxKindWebinar: 'Webinar' }

test('a report is never labelled an investor call', () => {
  assert.equal(kindLabel('report', D), 'Report')
  assert.notEqual(kindLabel('report', D), D.ctxKindCall)
})

test('each kind gets its own name', () => {
  assert.equal(kindLabel('call', D), 'Investor call')
  assert.equal(kindLabel('webinar', D), 'Webinar')
})

test('every kind in the vocabulary has a label — no kind falls through to a default', () => {
  const seen = new Set(EVENT_KINDS.map((k) => kindLabel(k, D)))
  assert.equal(seen.size, EVENT_KINDS.length)
})
