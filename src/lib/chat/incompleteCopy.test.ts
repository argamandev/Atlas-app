import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INCOMPLETE_COPY_KEY, incompleteMessage } from './incompleteCopy'
import { en } from '@/lib/i18n/dictionaries/en'
import { he } from '@/lib/i18n/dictionaries/he'
import type { ClientIncompleteCode } from '@/lib/api/chat2'

const CODES = Object.keys(INCOMPLETE_COPY_KEY) as ClientIncompleteCode[]

test('every incomplete code has real copy in BOTH locales', () => {
  // The degradation law is "visible on screen, in both locales". A code with an
  // empty Hebrew string satisfies the type and fails the law, so the emptiness is
  // what gets asserted — not merely the key's presence.
  assert.ok(CODES.length >= 9, `only ${CODES.length} codes mapped — the union shrank unnoticed`)
  for (const code of CODES) {
    for (const [name, dict] of [
      ['en', en],
      ['he', he],
    ] as const) {
      const msg = incompleteMessage(dict.chat.incomplete, code)
      assert.ok(msg.trim().length > 0, `${name}: ${code} renders nothing`)
    }
  }
})

test('the four stop reasons say four DIFFERENT things, in both locales', () => {
  // terminal.ts round 4 kept `length_limit`, `model_refused`, `model_paused` and
  // `stopped_unknown` as separate codes precisely so this surface could tell a
  // user four materially different things. If the copy collapses them back into
  // one sentence, that decision has been silently undone here instead of there.
  const four: ClientIncompleteCode[] = ['length_limit', 'model_refused', 'model_paused', 'stopped_unknown']
  for (const [name, dict] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const said = four.map((c) => incompleteMessage(dict.chat.incomplete, c))
    assert.equal(new Set(said).size, four.length, `${name}: the four stop reasons collapsed`)
  }
})

test('no two codes share a sentence — a code that cannot be told apart is not a code', () => {
  for (const [name, dict] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const said = CODES.map((c) => incompleteMessage(dict.chat.incomplete, c))
    assert.equal(new Set(said).size, CODES.length, `${name}: two codes render identically`)
  }
})

test('the Hebrew copy is actually Hebrew — an untranslated fallback is invisible on screen', () => {
  // A missing translation that silently serves the English string looks perfectly
  // fine to a typecheck and to an EN-only screenshot (M1/M4). The cheap mechanical
  // check is that the Hebrew string contains Hebrew letters.
  for (const code of CODES) {
    const msg = incompleteMessage(he.chat.incomplete, code)
    assert.match(msg, /[֐-׿]/, `he: ${code} has no Hebrew in it`)
  }
})

test('a corrupted dictionary still says SOMETHING rather than rendering silence', () => {
  // An `incomplete` answer that renders no notice is indistinguishable on screen
  // from a complete one — the whole lie the terminal-event design prevents.
  const broken = { ...en.chat.incomplete, lengthLimit: '' }
  assert.equal(incompleteMessage(broken, 'length_limit'), en.chat.incomplete.stoppedUnknown)
})
