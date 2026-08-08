import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { intakeResult } from './respond'
import type { AttachableSource } from '../data'
import type { IntakeResponse } from './types'

const file = (id: string): AttachableSource => ({
  sourceId: id,
  kind: 'document',
  title: id,
  company: null,
  when: null,
})

const base: IntakeResponse = { reply: null, status: 'clarifying', selected: [], fallback: null }

// ── the round-2 blocker ──────────────────────────────────────────────────────
// Atlas printed "great, I'm pulling them in now" over no file, no spinner and no
// notice, because `ready` survived a selection that had been emptied on a
// contradiction. `selectSources.ts` REQUIRES the `ready` reply to announce the
// pull, so the sentence was not a bug in the model — it was the correct sentence
// for a status that had become untrue.

test('ready with an empty selection cannot leave the route', () => {
  const out = intakeResult({ ...base, status: 'ready', reply: 'מעולה, מביא אותם עכשיו…', selected: [] })
  assert.equal(out.status, 'clarifying', 'a pull of nothing is a question, not a pull')
  assert.equal(out.reply, null, "the model's ready sentence claims files are on their way")
  assert.equal(out.unresolved, 'nothing_selected')
})

test('a detected conflict keeps its own, more specific cause', () => {
  const out = intakeResult({
    ...base,
    status: 'ready',
    reply: 'pulling them in',
    selected: [],
    unresolved: 'narrowing_conflict',
  })
  assert.equal(out.status, 'clarifying')
  assert.equal(out.unresolved, 'narrowing_conflict', 'never overwritten by the generic reason')
})

test('a real pull passes through untouched', () => {
  const ready: IntakeResponse = { ...base, status: 'ready', reply: null, selected: [file('a'), file('b')] }
  assert.deepEqual(intakeResult(ready), ready)
})

test('an ordinary clarifying turn passes through untouched, empty or not', () => {
  const asking: IntakeResponse = { ...base, reply: 'להביא את שתיהן?', selected: [file('a')] }
  assert.deepEqual(intakeResult(asking), asking)
  // clarifying + empty is the NORMAL not-yet-decided state and must not be
  // dressed up as a failure — nothing is claimed, so nothing is untrue.
  const empty: IntakeResponse = { ...base, reply: 'איזו חברה?' }
  assert.deepEqual(intakeResult(empty), empty)
  assert.equal(intakeResult(empty).unresolved, undefined)
})

// ── the guard, not the fix ───────────────────────────────────────────────────
// The invariant is only worth anything if it cannot be walked around. The route
// had FOUR exits and the bug was on one of them; a check at that one exit would
// have passed review and left the other three. So the envelope may be built in
// exactly one place, and this fails the battery if a second one appears.
test('the intake route builds its result envelope in exactly one place', () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/workspaces/[id]/intake/route.ts'),
    'utf8'
  )
  const envelopes = route.match(/\{\s*result[,:\s}]/g) ?? []
  assert.equal(
    envelopes.length,
    1,
    `expected one { result } envelope (inside respond()), found ${envelopes.length} — a new exit must go through respond(), or the ready/empty invariant is bypassed`
  )
  assert.match(route, /intakeResult\(/, 'respond() must run the invariant, not just wrap NextResponse.json')
  // Every result-bearing return goes through respond(); the only other returns
  // are error envelopes with an HTTP status.
  const returns = route.match(/return (respond|NextResponse\.json)\(/g) ?? []
  const viaRespond = returns.filter((r) => r.includes('respond')).length
  assert.ok(viaRespond >= 4, `expected every result exit to use respond(), found ${viaRespond}`)
})
