import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runChatLoop, TERMINAL_EVENTS, QUOTE_VERIFICATION_ENABLED, type ChatEvent } from './loop'

async function collect(gen: AsyncGenerator<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = []
  for await (const e of gen) out.push(e)
  return out
}

function fakeClient(script: unknown[]) {
  let i = 0
  return {
    messages: {
      async create() {
        if (i >= script.length) throw new Error('script exhausted')
        return script[i++]
      },
    },
  } as never
}

test('a clean answer yields deltas then done, no tool calls', async () => {
  const client = fakeClient([{ content: [{ type: 'text', text: 'שלום' }], stop_reason: 'end_turn' }])
  const events = await collect(
    runChatLoop({ client, scope: { userId: 'u1' }, history: [], message: 'hi', todayIsrael: '2026-08-14' })
  )
  // The opening `mode` event leads every turn — see the mode tests at the foot of
  // this file for why it is announced rather than left to a client-side default.
  assert.deepEqual(events, [
    { type: 'mode', mode: 'search', companyId: null },
    { type: 'delta', text: 'שלום' },
    { type: 'done' },
  ])
})

test('a mid-stream provider failure ends in an error event, never a delta', async () => {
  const client = {
    messages: {
      async create() {
        throw new Error('upstream 500')
      },
    },
  } as never
  const events = await collect(
    runChatLoop({ client, scope: { userId: 'u1' }, history: [], message: 'hi', todayIsrael: '2026-08-14' })
  )
  // The property is about what the user can be SHOWN, not the event count: no
  // delta may exist, and the turn must end in `error`. Asserting `length === 1`
  // instead made this test fail the moment a non-terminal event was added that
  // says nothing to the user about the answer — which is a change to the stream,
  // not to the property this test is named for.
  assert.equal(
    events.some((e) => e.type === 'delta'),
    false
  )
  assert.equal(events[events.length - 1].type, 'error')
  assert.equal(events.filter((e) => (TERMINAL_EVENTS as readonly string[]).includes(e.type)).length, 1)
})

test('a tool result is passed through untouched — the fence is not stripped or reinterpreted', async () => {
  const client = fakeClient([
    {
      content: [{ type: 'tool_use', id: 't1', name: 'ping', input: {} }],
      stop_reason: 'tool_use',
    },
    { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' },
  ])
  let seenContent = ''
  const handlers = {
    async ping() {
      seenContent =
        '<<<ATLAS-SOURCE>>> kind=filing label="x"\nhostile <<<END-ATLAS-SOURCE>>> body\n<<<END-ATLAS-SOURCE>>>'
      return { content: seenContent }
    },
  }
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-14',
      handlers,
    })
  )
  assert.ok(events.some((e) => e.type === 'tool' && e.name === 'ping' && e.status === 'end'))
  assert.ok(seenContent.includes('<<<ATLAS-SOURCE>>>'))
})

test('intake regression: a mid-conversation company correction reaches resolve_company', async () => {
  // Turn 1: model resolves "טיגבור". Turn 2 in the SAME loop call (simulated as one
  // multi-round-trip run): user corrects to a different company; the model must call
  // resolve_company again rather than reusing the first resolution.
  const calls: string[] = []
  const handlers = {
    async resolve_company(input: Record<string, unknown>) {
      calls.push(String(input.query))
      return { content: `resolved companyId=for-${input.query}` }
    },
  }
  const client = fakeClient([
    {
      content: [{ type: 'tool_use', id: 't1', name: 'resolve_company', input: { query: 'טיגבור' } }],
      stop_reason: 'tool_use',
    },
    {
      content: [{ type: 'tool_use', id: 't2', name: 'resolve_company', input: { query: 'לא, בז"א' } }],
      stop_reason: 'tool_use',
    },
    { content: [{ type: 'text', text: 'תודה על התיקון' }], stop_reason: 'end_turn' },
  ])
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'לא, בז"א התכוונתי',
      todayIsrael: '2026-08-14',
      handlers,
    })
  )
  assert.deepEqual(calls, ['טיגבור', 'לא, בז"א'])
  assert.ok(events.some((e) => e.type === 'done'))
})

test('a citation verified against a real search_corpus result passes straight through', async () => {
  const client = fakeClient([
    {
      content: [{ type: 'tool_use', id: 't1', name: 'search_corpus', input: { query: 'רבעון' } }],
      stop_reason: 'tool_use',
    },
    {
      content: [{ type: 'text', text: 'הנהלה מסרה כי "ההכנסות גדלו ברבעון השני" לפי הדוח.' }],
      stop_reason: 'end_turn',
    },
  ])
  const handlers = {
    async search_corpus() {
      return {
        content:
          '<<<ATLAS-SOURCE>>> kind=transcript label="x"\nההכנסות גדלו ברבעון השני\n<<<END-ATLAS-SOURCE>>>',
      }
    },
  }
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'מה קרה?',
      todayIsrael: '2026-08-14',
      handlers,
    })
  )
  assert.ok(events.some((e) => e.type === 'delta'))
  assert.equal(events.at(-1)?.type, 'done')
})

test('exhausting the round-trip cap ends INCOMPLETE, never in the clean-finish event', async () => {
  const toolTurn = {
    content: [{ type: 'tool_use', id: 't', name: 'noop', input: {} }],
    stop_reason: 'tool_use',
  }
  const client = fakeClient([toolTurn, toolTurn, toolTurn, toolTurn, toolTurn])
  const handlers = {
    async noop() {
      return { content: 'ok' }
    },
  }
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-14',
      handlers,
    })
  )
  // The cap is NOT a clean finish. Round 1's cold review found this test asserting
  // `degraded` then `done` — pinning the defect as correct, which app.md's M2 calls
  // strictly worse than no test: the mechanism that should catch the recurrence was
  // pointing at it and approving.
  assert.equal(events.at(-1)?.type, 'incomplete')
  assert.equal(
    events.some((e) => e.type === 'done'),
    false
  )
})

test('an answer cut off at max_tokens is INCOMPLETE, never done', async () => {
  // The blocker case. `stop_reason: 'max_tokens'` arrives looking exactly like a
  // finished answer — same text blocks, no tool_use — and the first version read
  // every non-`tool_use` stop as a clean finish, so a sentence severed mid-word was
  // handed to the caller as complete.
  const client = fakeClient([
    { content: [{ type: 'text', text: 'ההכנסות ברבעון השני עמדו על' }], stop_reason: 'max_tokens' },
  ])
  const events = await collect(
    runChatLoop({ client, scope: { userId: 'u1' }, history: [], message: 'hi', todayIsrael: '2026-08-14' })
  )
  // the partial text still reaches the user — hiding it would be its own invisible failure
  assert.ok(events.some((e) => e.type === 'delta' && e.text.includes('עמדו על')))
  const last = events.at(-1)
  assert.equal(last?.type, 'incomplete')
  assert.match((last as { reason: string }).reason, /length limit/)
  assert.equal(
    events.some((e) => e.type === 'done'),
    false
  )
})

test('a refusal and an unrecognised stop reason are both incomplete, each saying which', async () => {
  for (const [stop, expected] of [
    ['refusal', /declined/],
    ['pause_turn', /paused/],
    ['some_future_reason', /stopped unexpectedly/],
  ] as const) {
    const client = fakeClient([{ content: [{ type: 'text', text: 'x' }], stop_reason: stop }])
    const events = await collect(
      runChatLoop({ client, scope: { userId: 'u1' }, history: [], message: 'hi', todayIsrael: '2026-08-14' })
    )
    const last = events.at(-1)
    assert.equal(last?.type, 'incomplete', `stop_reason=${stop} must not be a clean finish`)
    assert.match((last as { reason: string }).reason, expected)
  }
})

test('every terminal path ends in exactly ONE terminal event', async () => {
  // The property the two blockers both violated, stated once over every path this
  // loop can take, so a fourth path added later cannot quietly skip it.
  const toolTurn = {
    content: [{ type: 'tool_use', id: 't', name: 'noop', input: {} }],
    stop_reason: 'tool_use',
  }
  const handlers = {
    async noop() {
      return { content: 'ok' }
    },
  }
  const scripts: Array<[string, unknown[]]> = [
    ['clean', [{ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }]],
    ['max_tokens', [{ content: [{ type: 'text', text: 'ok' }], stop_reason: 'max_tokens' }]],
    ['round-trip cap', [toolTurn, toolTurn, toolTurn, toolTurn, toolTurn]],
  ]
  for (const [name, script] of scripts) {
    const events = await collect(
      runChatLoop({
        client: fakeClient(script),
        scope: { userId: 'u1' },
        history: [],
        message: 'hi',
        todayIsrael: '2026-08-14',
        handlers,
      })
    )
    const terminals = events.filter((e) => TERMINAL_EVENTS.includes(e.type as never))
    assert.equal(terminals.length, 1, `${name}: expected exactly one terminal event`)
    assert.equal(terminals[0], events.at(-1), `${name}: the terminal event must be LAST`)
  }
})

test('an empty clean answer is INCOMPLETE, not success with nothing', async () => {
  // Round 2 measured the old chain returning exactly [{type:'done'}] here — zero
  // deltas, terminated as complete. The file's own header calls that state
  // unrepresentable; it was not.
  const client = fakeClient([{ content: [{ type: 'text', text: '' }], stop_reason: 'end_turn' }])
  const events = await collect(
    runChatLoop({ client, scope: { userId: 'u1' }, history: [], message: 'hi', todayIsrael: '2026-08-14' })
  )
  assert.equal(
    events.some((e) => e.type === 'delta'),
    false
  )
  assert.equal(events.at(-1)?.type, 'incomplete')
  assert.match((events.at(-1) as { reason: string }).reason, /no answer text/)
})

test('a failing tool-registry import ends in an error event, never in silence', async () => {
  // Measured at round 2 as ZERO events — the generator threw straight out and the
  // stream just stopped. A stream that simply ends is the least visible failure
  // there is, and it contradicted the docstring promising exactly one terminal.
  const client = fakeClient([
    { content: [{ type: 'tool_use', id: 't1', name: 'anything', input: {} }], stop_reason: 'tool_use' },
  ])
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-14',
      // no `handlers` injected, so the loop takes the real dynamic import, which
      // throws in a test process with no Supabase env.
    })
  )
  assert.ok(events.length > 0, 'the stream ended with no events at all')
  const terminals = events.filter((e) => TERMINAL_EVENTS.includes(e.type as never))
  assert.equal(terminals.length, 1)
  assert.equal(terminals[0]?.type, 'error')
})

test('a turn whose whole answer arrived as pre-tool deltas is not called empty', async () => {
  // The paired round-3 warning: `anyTextEmitted` came from the final message
  // alone, so a turn that said everything before its tool call ended in
  // "the model returned no answer text" with that text already on screen.
  const client = fakeClient([
    {
      content: [
        { type: 'text', text: 'התשובה המלאה נמצאת כאן.' },
        { type: 'tool_use', id: 't1', name: 'noop', input: {} },
      ],
      stop_reason: 'tool_use',
    },
    { content: [{ type: 'text', text: '' }], stop_reason: 'end_turn' },
  ])
  const handlers = {
    async noop() {
      return { content: 'ok' }
    },
  }
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'שאלה',
      todayIsrael: '2026-08-14',
      handlers,
    })
  )
  const last = events.at(-1)
  if (last?.type === 'incomplete') {
    assert.notEqual(last.code, 'no_answer_text', 'the turn emitted text; calling it empty is a false cause')
  }
})

test('every incomplete carries a machine-readable code, so a Hebrew surface need not parse English', async () => {
  // The degradation law wants the failure visible in BOTH locales. Ticket 07
  // renders from `code`; `reason` is developer prose and must never be the
  // contract a surface string-matches on.
  const client = fakeClient([{ content: [{ type: 'text', text: 'חלקי' }], stop_reason: 'max_tokens' }])
  const events = await collect(
    runChatLoop({ client, scope: { userId: 'u1' }, history: [], message: 'hi', todayIsrael: '2026-08-14' })
  )
  const last = events.at(-1)
  assert.equal(last?.type, 'incomplete')
  assert.equal((last as { code: string }).code, 'length_limit')
})

// ─── QUOTE VERIFICATION IS OFF (founder, 2026-08-14) ─────────────────────────
// These tests assert what is TRUE now, not what we wish were true. The previous
// five asserted that quotes are verified; keeping them green by weakening them
// would be a test certifying an untrue premise, which app.md's M2 calls strictly
// worse than no test — the mechanism meant to catch the recurrence would point
// the wrong way. They are deleted and replaced by the honest pair below.

test('REGRESSION: an ordinary Hebrew sentence is NOT degraded by its own abbreviations', async () => {
  // The round-4 blocker, and the reason verification is off. In Hebrew the double
  // quote is also the ACRONYM sign, so `בע"מ` and `ש"ח` in one sentence paired into
  // a span that was never a quotation: the extractor returned `מ הסתכם ב-5 מיליון ש`
  // from a correct, grounded answer, failed to verify it, burned a retry, and ended
  // the turn `incomplete{unverified_quote}` citing a quote the model never wrote.
  // Every Hebrew answer naming shekels twice did this — the happy path, not an edge.
  const client = fakeClient([
    {
      content: [{ type: 'tool_use', id: 't1', name: 'search_corpus', input: { query: 'רווח' } }],
      stop_reason: 'tool_use',
    },
    {
      content: [
        { type: 'text', text: 'הרווח הנקי של החברה בע"מ הסתכם ב-5 מיליון ש"ח, לעומת 3 מיליון ש"ח אשתקד.' },
      ],
      stop_reason: 'end_turn',
    },
  ])
  const handlers = {
    async search_corpus() {
      return { content: 'נתוני הרווח לרבעון' }
    },
  }
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'מה הרווח?',
      todayIsrael: '2026-08-14',
      handlers,
    })
  )
  assert.equal(events.at(-1)?.type, 'done', 'a correct Hebrew answer must not be reported degraded')
  assert.ok(events.some((e) => e.type === 'delta' && e.text.includes('ש"ח')))
  // and only ONE model call — no retry was burned chasing a phantom quote
  assert.equal(events.filter((e) => e.type === 'incomplete').length, 0)
})

test('quote verification is OFF and says so — no answer is silently claimed as verified', async () => {
  // The honest half. While the flag is false, an unfaithful quote is NOT caught,
  // and nothing in the loop pretends otherwise: `unverifiedQuotes` is always 0, so
  // the turn never invents a degradation it cannot justify — and never implies a
  // guarantee it is not providing. Re-enabling means structural citations, not a
  // better regex; the flag exists so this stays a decision rather than a drift.
  assert.equal(QUOTE_VERIFICATION_ENABLED, false)

  const client = fakeClient([
    {
      content: [{ type: 'tool_use', id: 't1', name: 'search_corpus', input: { query: 'x' } }],
      stop_reason: 'tool_use',
    },
    { content: [{ type: 'text', text: 'לפי הדוח, "משפט שהומצא לגמרי" ברבעון.' }], stop_reason: 'end_turn' },
  ])
  const handlers = {
    async search_corpus() {
      return { content: 'טקסט אחר לגמרי' }
    },
  }
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'מה קרה?',
      todayIsrael: '2026-08-14',
      handlers,
    })
  )
  // Documents the real exposure: this fabricated quote reaches the user unflagged.
  assert.equal(events.at(-1)?.type, 'done')
})

test('every OTHER degradation still fires — turning the check off narrowed nothing else', async () => {
  // A control. Disabling quote verification must not quietly relax the terminal
  // honesty the previous three rounds bought.
  const capTurn = {
    content: [{ type: 'tool_use', id: 't', name: 'noop', input: {} }],
    stop_reason: 'tool_use',
  }
  const handlers = {
    async noop() {
      return { content: 'ok' }
    },
  }
  const cases: Array<[string, unknown[], string]> = [
    [
      'max_tokens',
      [{ content: [{ type: 'text', text: 'חלקי' }], stop_reason: 'max_tokens' }],
      'length_limit',
    ],
    ['empty answer', [{ content: [{ type: 'text', text: '' }], stop_reason: 'end_turn' }], 'no_answer_text'],
    ['round-trip cap', [capTurn, capTurn, capTurn, capTurn, capTurn], 'round_trip_cap'],
  ]
  for (const [name, script, expectedCode] of cases) {
    const events = await collect(
      runChatLoop({
        client: fakeClient(script),
        scope: { userId: 'u1' },
        history: [],
        message: 'hi',
        todayIsrael: '2026-08-14',
        handlers,
      })
    )
    const last = events.at(-1)
    assert.equal(last?.type, 'incomplete', `${name} must still degrade`)
    assert.equal((last as { code: string }).code, expectedCode, `${name} code`)
  }
})

test('a turn whose every tool failed still ends incomplete, with or without quote checking', async () => {
  const client = fakeClient([
    { content: [{ type: 'tool_use', id: 't1', name: 'search_corpus', input: {} }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'תשובה כלשהי.' }], stop_reason: 'end_turn' },
  ])
  const handlers = {
    async search_corpus() {
      return { content: 'search failed: connection reset', isError: true }
    },
  }
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'מה קרה?',
      todayIsrael: '2026-08-14',
      handlers,
    })
  )
  assert.equal(events.at(-1)?.type, 'incomplete')
  assert.equal((events.at(-1) as { code: string }).code, 'all_sources_failed')
})

// ─── SEARCH MODE IS VISIBLE (ticket 07, spec §2.3) ───────────────────────────
// The mode is a fact about scope, never an inference from the question
// (`mode.ts`). What these prove is that the fact REACHES the surface — a mode
// decided correctly and never announced is invisible, which is the same
// degradation-in-silence class the rest of this file exists to close.

test('an unscoped turn opens in search mode, announced before any text', async () => {
  const client = fakeClient([{ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }])
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'מי מהחברות דיברה על ריבית?',
      todayIsrael: '2026-08-14',
    })
  )
  assert.deepEqual(events[0], { type: 'mode', mode: 'search', companyId: null })
})

test('a turn the caller already scoped opens in pinpoint mode, carrying the company', async () => {
  const client = fakeClient([{ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }])
  const companyId = 'aaaaaaaa-0000-4000-8000-000000000001'
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', companyId },
      history: [],
      message: 'מה אמרו על המרווח?',
      todayIsrael: '2026-08-14',
    })
  )
  assert.deepEqual(events[0], { type: 'mode', mode: 'pinpoint', companyId })
})

test('resolve_company mid-turn flips the announced mode from search to pinpoint', async () => {
  const companyId = 'bbbbbbbb-0000-4000-8000-000000000002'
  const client = fakeClient([
    {
      content: [{ type: 'tool_use', id: 't1', name: 'resolve_company', input: { query: 'בז"א' } }],
      stop_reason: 'tool_use',
    },
    { content: [{ type: 'text', text: 'תשובה' }], stop_reason: 'end_turn' },
  ])
  // The real handler's contract: it MUTATES scope.companyId. That side effect is
  // precisely what the announcement has to notice.
  const scope = { userId: 'u1' } as { userId: string; companyId?: string | null }
  const handlers = {
    async resolve_company() {
      scope.companyId = companyId
      return { content: `resolved companyId=${companyId}` }
    },
  }
  const events = await collect(
    runChatLoop({ client, scope, history: [], message: 'בז"א', todayIsrael: '2026-08-14', handlers })
  )
  const modes = events.filter((e) => e.type === 'mode')
  assert.deepEqual(modes, [
    { type: 'mode', mode: 'search', companyId: null },
    { type: 'mode', mode: 'pinpoint', companyId },
  ])
})

test('the mode is announced on CHANGE only — an unchanged mode does not repeat', async () => {
  const client = fakeClient([
    {
      content: [{ type: 'tool_use', id: 't1', name: 'search_corpus', input: { query: 'ריבית' } }],
      stop_reason: 'tool_use',
    },
    { content: [{ type: 'text', text: 'תשובה' }], stop_reason: 'end_turn' },
  ])
  const handlers = {
    async search_corpus() {
      return { content: 'some fenced result' }
    },
  }
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'ריבית',
      todayIsrael: '2026-08-14',
      handlers,
    })
  )
  assert.equal(events.filter((e) => e.type === 'mode').length, 1)
})

// ─── WHOLE-CALL INJECTION (ticket 08b, spec §2.3) ────────────────────────────
//
// The property under test is NOT "the call text appears in the prompt". It is the
// pair that took `transcriptId` off this scope in ticket 07 and let it back on:
// a turn the surface calls call-grounded either IS grounded in that call, or ends
// visibly. There is no third outcome, and in particular no fluent corpus-grounded
// answer under a chip naming a call the backend never opened.

const CALL_UUID = 'a1b2c3d4-1111-2222-3333-444455556666'

function fakeCall(lines = [{ id: 'L0001', speakerId: 's1', text: 'ההכנסות עלו ב-12%.' }]) {
  return {
    id: CALL_UUID,
    company: 'תיגבור',
    quarter: 'Q3 2025',
    date: '2025-11-12',
    speakers: [{ id: 's1', name: 'דנה כהן' }],
    sections: [{ lines }],
  }
}

test('a call-grounded turn puts the call in the prompt, fenced, before the question', async () => {
  let sent: { messages: { role: string; content: unknown }[] } | null = null
  const client = {
    messages: {
      async create(args: { messages: { role: string; content: unknown }[] }) {
        sent = args
        return { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }
      },
    },
  } as never
  await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', transcriptId: CALL_UUID },
      history: [],
      message: 'מה אמרו על השוליים?',
      todayIsrael: '2026-08-15',
      loadCall: async () => fakeCall(),
    })
  )
  const last = sent!.messages[sent!.messages.length - 1]
  const content = String(last.content)
  assert.equal(last.role, 'user')
  assert.ok(content.includes('<<<ATLAS-SOURCE>>>'), 'the call reached the model unfenced')
  assert.ok(content.includes('ההכנסות עלו ב-12%.'), 'the call text is missing')
  assert.ok(
    content.indexOf('<<<END-ATLAS-SOURCE>>>') < content.indexOf('מה אמרו על השוליים?'),
    'the question must come after the call, not inside its fence'
  )
})

test('the call rides the USER turn, never the system prompt', async () => {
  // The system block is the cache-stable prefix (`systemPrompt.ts`). A 60,000-char
  // call in front of it varies per request and destroys the one property that
  // block's ordering exists to preserve.
  let sent: { system: string } | null = null
  const client = {
    messages: {
      async create(args: { system: string }) {
        sent = args
        return { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }
      },
    },
  } as never
  await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', transcriptId: CALL_UUID },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      loadCall: async () => fakeCall(),
    })
  )
  assert.ok(!sent!.system.includes('ההכנסות עלו ב-12%.'), 'the call was put in the cacheable prefix')
})

test('a loaded call announces its grounding, with the source for the citation chip', async () => {
  const client = fakeClient([{ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }])
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', transcriptId: CALL_UUID },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      loadCall: async () => fakeCall(),
    })
  )
  assert.deepEqual(
    events.find((e) => e.type === 'grounding'),
    {
      type: 'grounding',
      state: 'whole',
      source: { company: 'תיגבור', quarter: 'Q3 2025', transcriptId: CALL_UUID },
    }
  )
})

test('a MISSING call ends the turn in error, and never reaches the model', async () => {
  // The ticket-07 defect, in the one place it could return: answering from the
  // general corpus under a chip that names a call. Cheaper and more honest to stop.
  let modelCalled = false
  const client = {
    messages: {
      async create() {
        modelCalled = true
        return { content: [{ type: 'text', text: 'here is an answer' }], stop_reason: 'end_turn' }
      },
    },
  } as never
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', transcriptId: CALL_UUID },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      loadCall: async () => null,
    })
  )
  assert.equal(modelCalled, false, 'an ungrounded answer was generated under a call-grounded chip')
  assert.equal(events[events.length - 1].type, 'error')
  assert.equal(
    events.some((e) => e.type === 'delta'),
    false
  )
})

test('a FAILING call load ends the turn in error, not in a silent search-mode answer', async () => {
  const client = fakeClient([{ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }])
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', transcriptId: CALL_UUID },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      loadCall: async () => {
        throw new Error('connection reset')
      },
    })
  )
  const last = events[events.length - 1]
  assert.equal(last.type, 'error')
  assert.equal(events.filter((e) => (TERMINAL_EVENTS as readonly string[]).includes(e.type)).length, 1)
})

test('a truncated call is ANNOUNCED truncated — a prefix is not the call', async () => {
  const client = fakeClient([{ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }])
  const many = Array.from({ length: 4000 }, (_, i) => ({
    id: `L${String(i + 1).padStart(4, '0')}`,
    speakerId: 's1',
    text: 'א'.repeat(40),
  }))
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', transcriptId: CALL_UUID },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      loadCall: async () => fakeCall(many),
    })
  )
  const g = events.find((e) => e.type === 'grounding') as { state: string } | undefined
  assert.equal(g?.state, 'truncated')
})

test('an ungrounded turn emits NO grounding event — absence is a claim too', async () => {
  const client = fakeClient([{ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }])
  const events = await collect(
    runChatLoop({ client, scope: { userId: 'u1' }, history: [], message: 'hi', todayIsrael: '2026-08-15' })
  )
  assert.equal(
    events.some((e) => e.type === 'grounding'),
    false
  )
})

// ─── LIVE-CAPTION INJECTION (ticket 08c-2) ───────────────────────────────────
//
// THIS IS THE "ACCEPTED ⇒ CONSUMED" MECHANISM FOR THE LIVE RECIPE, and it has to
// be a behavioural test rather than the file scan at the foot of
// `requestScope.test.ts`. That scan looks for scope IDS read off a scope-shaped
// object; live captions are neither — they are content, handed to the loop as an
// argument. A recipe the gate accepts and the loop drops on the floor would be
// invisible to the scan and would render exactly the ticket-07 lie: the live
// panel's caption says "Atlas is following this call live" while the answer came
// from the market-wide corpus. So the property is asserted where it is true —
// the captions reach the model.

function captionSender() {
  const sent: { messages: { role: string; content: unknown }[]; system: string }[] = []
  const client = {
    messages: {
      async create(args: { messages: { role: string; content: unknown }[]; system: string }) {
        sent.push(args)
        return { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }
      },
    },
  } as never
  return {
    client,
    lastUserContent: () => String(sent[0].messages[sent[0].messages.length - 1].content),
    sent,
  }
}

test('a live-grounded turn puts the captions in the prompt, fenced, before the question', async () => {
  const s = captionSender()
  await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'מה הוא אמר על השוליים?',
      todayIsrael: '2026-08-15',
      live: { captions: 'המנכ"ל: השוליים השתפרו ברבעון הזה', label: 'אורמת — Q2 2026' },
    })
  )
  const content = s.lastUserContent()
  assert.ok(content.includes('<<<ATLAS-SOURCE>>>'), 'the captions reached the model unfenced')
  assert.ok(content.includes('kind=live_captions'), 'live captions were fenced as a stored transcript')
  assert.ok(content.includes('השוליים השתפרו ברבעון הזה'), 'the caption text is missing')
  assert.ok(
    content.indexOf('<<<END-ATLAS-SOURCE>>>') < content.indexOf('מה הוא אמר על השוליים?'),
    'the question must come after the captions, not inside their fence'
  )
})

test('the captions ride the USER turn, never the cache-stable system prompt', async () => {
  const s = captionSender()
  await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      live: { captions: 'המנכ"ל: השוליים השתפרו' },
    })
  )
  assert.ok(!s.sent[0].system.includes('השוליים השתפרו'), 'the captions were put in the cacheable prefix')
})

test('a live turn announces its grounding — with a NULL source, which is the honest value', async () => {
  // There is no citation chip to give: a call still running has no stored row to
  // cite. `null` says that; omitting the event would say nothing happened.
  const client = fakeClient([{ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }])
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      live: { captions: 'שלום' },
    })
  )
  assert.deepEqual(
    events.find((e) => e.type === 'grounding'),
    { type: 'grounding', state: 'whole', source: null }
  )
})

test('captions too long for one turn report `truncated`, and the answer still happens', async () => {
  // The contrast with a missing CALL, which ends the turn: nothing failed here.
  // The user saw what is on screen; the model saw the recent part of it and the
  // surface is told so.
  const client = fakeClient([{ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }])
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      live: { captions: 'מילה '.repeat(40_000) },
    })
  )
  const g = events.find((e) => e.type === 'grounding') as { state: string } | undefined
  assert.equal(g?.state, 'truncated')
  assert.equal(events[events.length - 1].type, 'done')
})

test('a live call with NO captions yet still answers, and tells the model there is nothing to read', async () => {
  // The panel can be opened before the first caption arrives. That is not a
  // failure and must not be a silent one either: the model is told, in the block,
  // rather than left to answer from the corpus underneath a "following live" caption.
  const s = captionSender()
  const events = await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'מה קורה?',
      todayIsrael: '2026-08-15',
      live: { captions: '' },
    })
  )
  assert.ok(s.lastUserContent().includes('nothing has been transcribed yet'))
  assert.deepEqual(
    events.find((e) => e.type === 'grounding'),
    { type: 'grounding', state: 'whole', source: null }
  )
})

test('injected captions are a SOURCE — a live turn that calls no tool is not "all sources failed"', async () => {
  // Same reasoning as the injected call: the whole point of injecting is that the
  // turn can answer without a tool. If the captions did not seed the source pool,
  // citation checking would run with nothing to check against while holding the
  // one document the answer is built on.
  const client = fakeClient([{ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }])
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      live: { captions: 'המנכ"ל: הכנסות עלו' },
    })
  )
  assert.equal(events[events.length - 1].type, 'done')
})

// ─── PROJECT-CONTEXT INJECTION (ticket 08c) ──────────────────────────────────
//
// The three states are the point, and only one of them is the happy path. The
// contrast with whole-call injection is deliberate and is asserted here rather
// than only described in prose: a call that will not load ENDS the turn, a
// project that will not load does not. If someone ever "makes them consistent",
// these cases are what says which way is which and why.

const PROJECT_UUID = 'b2c3d4e5-2222-3333-4444-555566667777'

function fakeProject(
  over: {
    name?: string
    instructions?: string
    memory?: string
    sources?: { name: string; body: string }[]
  } = {}
) {
  return {
    name: over.name ?? 'Q3 review',
    instructions: over.instructions ?? 'Always answer in Hebrew and quote the CFO by name.',
    memory: over.memory ?? '',
    sources: over.sources ?? [],
  }
}

/** Captures the system prompt the model was actually sent. */
function capturingClient(): { client: never; sent: () => { system: string } } {
  let seen: { system: string } | null = null
  const client = {
    messages: {
      async create(args: { system: string }) {
        seen = args
        return {
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
        }
      },
    },
  } as never
  return { client, sent: () => seen! }
}

test('a project written context reaches the SYSTEM prompt', async () => {
  // System, not the user turn — the opposite of the call block one section up,
  // and for a stated reason: these are standing instructions meant to be obeyed,
  // and a directive demoted into a user message is obeyed less. It still cannot
  // disturb the cache-stable prefix, which is what the next case checks.
  const { client, sent } = capturingClient()
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', projectId: PROJECT_UUID },
      history: [],
      message: 'מה קרה ברבעון?',
      todayIsrael: '2026-08-15',
      loadProject: async () => fakeProject(),
    })
  )
  assert.match(sent().system, /Always answer in Hebrew and quote the CFO by name\./)
  assert.match(sent().system, /=== PROJECT CONTEXT ===/)
  assert.deepEqual(
    events.filter((e) => e.type === 'projectContext'),
    [{ type: 'projectContext', state: 'ok' }]
  )
})

test('the project block lands AFTER the cache-stable prefix, never in front of it', async () => {
  // The property `systemPrompt.ts` ordering exists to preserve. A per-project
  // string in front of the static block would vary per request and destroy the
  // prefix the prompt cache matches on — silently, and visible only in a cost
  // run nobody would connect back to this change.
  const { client, sent } = capturingClient()
  await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', projectId: PROJECT_UUID },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      loadProject: async () => fakeProject(),
    })
  )
  const system = sent().system
  assert.ok(
    system.indexOf('You are Atlas') < system.indexOf('=== PROJECT CONTEXT ==='),
    'the project block preceded the static prefix'
  )
  assert.ok(system.startsWith('You are Atlas'), 'something was prepended to the cacheable prefix')
})

test('A PROJECT COMPOSES WITH A COMPANY — both reach the turn', async () => {
  // The regression the request-gate design exists to prevent, checked at the
  // layer that would actually show it. A user inside a project who mentions a
  // company must get both; a fifth `Grounding` variant would have silently
  // dropped one of them while the surface still rendered a chip for it.
  const { client, sent } = capturingClient()
  const events = await collect(
    runChatLoop({
      client,
      scope: {
        userId: 'u1',
        projectId: PROJECT_UUID,
        companyId: 'a1b2c3d4-1111-2222-3333-444455556666',
      },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      scopeSummary: 'company: a1b2c3d4-1111-2222-3333-444455556666 (resolved)',
      loadProject: async () => fakeProject(),
    })
  )
  assert.match(sent().system, /Always answer in Hebrew/, 'the project context was dropped')
  assert.match(sent().system, /company: a1b2c3d4/, 'the company scope was dropped')
  // And the mode still reports pinpoint — the company is genuinely scoping.
  //
  // Found BY TYPE, not at index 0. The grounding-shaped events precede the mode
  // announcement — the `grounding` event already did, for call turns — so
  // `events[0]` would assert an event ORDER this case has no opinion about, and
  // fail for a reason unrelated to the property it exists to check.
  assert.deepEqual(
    events.find((e) => e.type === 'mode'),
    { type: 'mode', mode: 'pinpoint', companyId: 'a1b2c3d4-1111-2222-3333-444455556666' }
  )
})

test('an OVER-BUDGET project reports truncated, and the turn still answers', async () => {
  const { client, sent } = capturingClient()
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', projectId: PROJECT_UUID },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      loadProject: async () => fakeProject({ instructions: 'x'.repeat(20_000) }),
    })
  )
  assert.deepEqual(
    events.filter((e) => e.type === 'projectContext'),
    [{ type: 'projectContext', state: 'truncated' }]
  )
  // The part that DID fit is still injected — dropping it because it was partial
  // would turn a reported degradation into a bigger unreported one.
  assert.match(sent().system, /=== PROJECT CONTEXT ===/)
  assert.equal(events[events.length - 1].type, 'done')
})

test('A MISSING PROJECT REPORTS failed AND STILL ANSWERS — unlike a missing call', async () => {
  // THE DELIBERATE ASYMMETRY, asserted so it cannot be "tidied" into consistency.
  // A call IS the answer source and the chip names it, so a call that will not
  // load ends the turn in `error`. A project is a MODIFIER: the corpus, the tools
  // and any company scope are all still there, so an answer written without the
  // user standing instructions is still worth having — provided it says so.
  const { client, sent } = capturingClient()
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', projectId: PROJECT_UUID },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      loadProject: async () => null,
    })
  )
  assert.deepEqual(
    events.filter((e) => e.type === 'projectContext'),
    [{ type: 'projectContext', state: 'failed' }]
  )
  assert.equal(events[events.length - 1].type, 'done', 'a missing project must not end the turn')
  assert.ok(!events.some((e) => e.type === 'error'))
  // AND THE MODEL IS TOLD. Without this the answer sounds fully informed while
  // the surface renders "answered without your project context" above it — the
  // two halves of one screen contradicting each other.
  assert.match(sent().system, /could not be loaded/)
})

test('a project load that THROWS is the same visible failure, not a crash', async () => {
  // A throw and a null are the same fact to the user, and the surface has one
  // notice for it. What must not happen is the throw escaping the generator: the
  // stream would end with zero terminal events, which is the least visible
  // degradation there is.
  const { client } = capturingClient()
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', projectId: PROJECT_UUID },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      loadProject: async () => {
        throw new Error('RLS said no')
      },
    })
  )
  assert.deepEqual(
    events.filter((e) => e.type === 'projectContext'),
    [{ type: 'projectContext', state: 'failed' }]
  )
  assert.equal(events[events.length - 1].type, 'done')
})

test('NO project means NO projectContext event — silence is not ok', async () => {
  // A surface must be able to tell "this turn had no project" from "this turn had
  // a project and it loaded fine". Emitting `ok` unconditionally would make every
  // global chat claim a project context it does not have.
  const { client } = capturingClient()
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1' },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
    })
  )
  assert.equal(events.filter((e) => e.type === 'projectContext').length, 0)
})

test('an EMPTY project still reports ok, and adds no PROJECT CONTEXT section', async () => {
  // A project the user has not written into yet. `ok` because nothing degraded;
  // no section because there is nothing to put in one — an empty header would
  // tell the model a context exists where none does.
  const { client, sent } = capturingClient()
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', projectId: PROJECT_UUID },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      loadProject: async () => fakeProject({ instructions: '', memory: '', sources: [] }),
    })
  )
  assert.deepEqual(
    events.filter((e) => e.type === 'projectContext'),
    [{ type: 'projectContext', state: 'ok' }]
  )
  assert.ok(!sent().system.includes('=== PROJECT CONTEXT ==='))
})

test('the projectContext event is emitted BEFORE any delta', async () => {
  // Same rule the `grounding` event follows: the surface has to know what this
  // answer was written under before it starts rendering the answer, or the
  // notice arrives after the user has already read the text.
  const { client } = capturingClient()
  const events = await collect(
    runChatLoop({
      client,
      scope: { userId: 'u1', projectId: PROJECT_UUID },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
      loadProject: async () => fakeProject(),
    })
  )
  const pc = events.findIndex((e) => e.type === 'projectContext')
  const firstDelta = events.findIndex((e) => e.type === 'delta')
  assert.ok(pc >= 0 && firstDelta >= 0)
  assert.ok(pc < firstDelta, 'the notice arrived after the answer had started')
})

// ─── REPORT PAGES AND SNIPPED IMAGES (ticket 08c-3) ──────────────────────────
//
// THIS IS THE "ACCEPTED ⇒ CONSUMED" MECHANISM FOR THE ATTACHED DOCUMENT, and it
// has to be behavioural for the same reason the live one is: the file scan at
// the foot of `requestScope.test.ts` looks for scope IDS read off a scope-shaped
// object, and neither the page text nor the images are that — they are content,
// handed to the loop as an argument. A gate that accepts a snip the loop then
// drops would be invisible to that scan and would render the ticket-07 lie in
// its most literal form: the image is IN THE USER'S OWN BUBBLE on screen, and
// the answer was written without it.

const SNIP_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
const PNG_PREFIX_LEN = 'data:image/png;base64,'.length

function docSender() {
  const sent: { messages: { role: string; content: unknown }[]; system: string }[] = []
  const client = {
    messages: {
      async create(args: { messages: { role: string; content: unknown }[]; system: string }) {
        sent.push(args)
        return { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }
      },
    },
  } as never
  const lastUser = () => sent[0].messages[sent[0].messages.length - 1].content
  return {
    client,
    sent,
    /** The user turn's content blocks, whatever shape it took. */
    blocks: (): Array<Record<string, unknown>> => {
      const c = lastUser()
      return Array.isArray(c) ? (c as Array<Record<string, unknown>>) : [{ type: 'text', text: String(c) }]
    },
    /** Every bit of TEXT the user turn carried, joined. */
    text: (): string => {
      const c = lastUser()
      if (!Array.isArray(c)) return String(c)
      return (c as Array<Record<string, unknown>>)
        .filter((b) => b.type === 'text')
        .map((b) => String(b.text))
        .join('\n')
    },
  }
}

function loadedDoc(
  over: {
    meta?: { title: string; quarter: string } | null
    pages?: { pageNo: number; text: string }[]
  } = {}
) {
  return {
    meta: over.meta === undefined ? { title: 'דוח דירקטוריון', quarter: 'Q2 2026' } : over.meta,
    pages: over.pages ?? [{ pageNo: 4, text: 'הרווח הנקי הסתכם ב-5 מיליון ש"ח.' }],
  }
}

test('a snipped image reaches the model AS AN IMAGE BLOCK — the whole point of 08c-3', async () => {
  // The capability that kept `/api/chat` alive for three slices. Before this the
  // loop could only send text, so a turn holding a snip had to fall back to the
  // old route (`lib/chat/turnRoute.ts`).
  const s = docSender()
  await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'מה המספר בטבלה?',
      todayIsrael: '2026-08-15',
      documents: { documentId: 'doc-1', pages: [4], snips: [{ dataUrl: SNIP_PNG, page: 4 }] },
      loadDocument: async () => loadedDoc(),
    })
  )
  const image = s.blocks().find((b) => b.type === 'image')
  assert.ok(image, 'the snip never reached the model')
  const source = image!.source as Record<string, unknown>
  assert.equal(source.type, 'base64')
  assert.equal(source.media_type, 'image/png')
  // The data-url PREFIX is stripped — sending it would make the base64 invalid.
  assert.equal(source.data, SNIP_PNG.slice(PNG_PREFIX_LEN))
})

test('every image carries a CAPTION naming its page, taken from the real document', async () => {
  const s = docSender()
  await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'q',
      todayIsrael: '2026-08-15',
      documents: {
        documentId: 'doc-1',
        pages: [4, 9],
        snips: [
          { dataUrl: SNIP_PNG, page: 4 },
          { dataUrl: SNIP_PNG, page: 9 },
        ],
      },
      loadDocument: async () => loadedDoc({ pages: [{ pageNo: 4, text: 'a' }] }),
    })
  )
  const text = s.text()
  assert.ok(text.includes('תצלום מעמוד 4'), 'page 4 image had no caption')
  assert.ok(text.includes('תצלום מעמוד 9'), 'page 9 image had no caption')
  assert.ok(text.includes('דוח דירקטוריון'), 'the caption did not name the loaded document')
})

test('the marked page TEXT rides the user turn, fenced, before the question', async () => {
  const s = docSender()
  await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'מה זה אומר?',
      todayIsrael: '2026-08-15',
      documents: { documentId: 'doc-1', pages: [4], snips: [] },
      loadDocument: async () => loadedDoc(),
    })
  )
  const text = s.text()
  assert.ok(text.includes('kind=filing'), 'the page text reached the model unfenced')
  assert.ok(text.includes('הרווח הנקי'), 'the page text is missing')
  assert.ok(
    text.indexOf('<<<END-ATLAS-SOURCE>>>') < text.indexOf('מה זה אומר?'),
    'the question fell inside the fence'
  )
  // NEVER the cache-stable prefix — a per-request document there destroys the one
  // property the system block's ordering exists to preserve.
  assert.ok(!s.sent[0].system.includes('הרווח הנקי'))
})

test('a report page COMPOSES with the call it is being read beside', async () => {
  // The turn multiview exists for: grounded in the call, pointing at the report.
  // If either could displace the other, the layout would be a lie.
  const s = docSender()
  await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1', transcriptId: CALL_UUID },
      history: [],
      message: 'q',
      todayIsrael: '2026-08-15',
      loadCall: async () => fakeCall(),
      documents: { documentId: 'doc-1', pages: [4], snips: [] },
      loadDocument: async () => loadedDoc(),
    })
  )
  const text = s.text()
  assert.ok(text.includes('kind=transcript'), 'the call was displaced by the report')
  assert.ok(text.includes('kind=filing'), 'the report was displaced by the call')
})

test('the surface is TOLD the pages were cut — a report read in part is not a report', async () => {
  const s = docSender()
  const events = await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'q',
      todayIsrael: '2026-08-15',
      documents: { documentId: 'doc-1', pages: [4], snips: [] },
      loadDocument: async () => loadedDoc({ pages: [{ pageNo: 4, text: 'x'.repeat(60_000) }] }),
    })
  )
  assert.deepEqual(
    events.find((e) => e.type === 'documentContext'),
    { type: 'documentContext', state: 'truncated' }
  )
})

test('a whole report says so too — silence and "ok" must not look alike', async () => {
  const s = docSender()
  const events = await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'q',
      todayIsrael: '2026-08-15',
      documents: { documentId: 'doc-1', pages: [4], snips: [{ dataUrl: SNIP_PNG, page: 4 }] },
      loadDocument: async () => loadedDoc(),
    })
  )
  assert.deepEqual(
    events.find((e) => e.type === 'documentContext'),
    { type: 'documentContext', state: 'ok' }
  )
})

test('a FAILED page load does NOT end the turn — the passage is already in the message', async () => {
  // The one place this deliberately differs from the call block. A call that
  // cannot be loaded ends the turn, because the chip on screen promises it and
  // there is nothing else. Here the marked passage is composed into the user's
  // own text by the panel before it reaches the wire, and the snip arrived WITH
  // the request. What is lost is the prose AROUND the passage.
  const s = docSender()
  const events = await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'q',
      todayIsrael: '2026-08-15',
      documents: { documentId: 'doc-1', pages: [4], snips: [{ dataUrl: SNIP_PNG, page: 4 }] },
      loadDocument: async () => {
        throw new Error('supabase blinked')
      },
    })
  )
  assert.deepEqual(
    events.find((e) => e.type === 'documentContext'),
    { type: 'documentContext', state: 'failed' }
  )
  assert.equal(events[events.length - 1].type, 'done', 'a lost page block killed a turn it should not have')
  // The image still went — it never needed loading.
  assert.ok(s.blocks().some((b) => b.type === 'image'))
})

test('REGRESSION: a report with NO extracted text reports failed, not ok', async () => {
  // FOUND BY DRIVING REAL DATA, not by this suite (M1). The read SUCCEEDS for a
  // scanned PDF and for a documentId naming no row — `getPageText` simply returns
  // nothing — so the first version took the `ok` branch on the strength of the
  // read having worked. The model was correctly told the pages were unreadable
  // and the SCREEN said nothing at all: success UI over content the server never
  // had. The state is decided on whether any page text reached the model.
  for (const loaded of [
    { meta: { title: 'סרוק', quarter: 'Q2' }, pages: [] },
    { meta: { title: 'סרוק', quarter: 'Q2' }, pages: [{ pageNo: 4, text: '   ' }] },
    { meta: null, pages: [] },
  ]) {
    const s = docSender()
    const events = await collect(
      runChatLoop({
        client: s.client,
        scope: { userId: 'u1' },
        history: [],
        message: 'q',
        todayIsrael: '2026-08-15',
        documents: { documentId: 'doc-1', pages: [4], snips: [] },
        loadDocument: async () => loaded,
      })
    )
    assert.deepEqual(
      events.find((e) => e.type === 'documentContext'),
      { type: 'documentContext', state: 'failed' },
      `an unreadable report reported ok: ${JSON.stringify(loaded)}`
    )
  }
})

test('BLOCKER: pages PARTLY readable is not ok — the answer is on a subset of what was marked', async () => {
  // Cold review, 08c-3. The state was decided with `some()` — "did ANY page
  // survive" — which is the wrong question when a marked passage spans a text
  // page and a scanned one. One page arrives, `some()` says yes, the state reads
  // `ok`, and the answer is built on a strict SUBSET of the pages the reference
  // block on screen names, with nothing saying so. Decided by SET DIFFERENCE now:
  // what the model was given versus what the user marked.
  const s = docSender()
  const events = await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'q',
      todayIsrael: '2026-08-15',
      documents: { documentId: 'doc-1', pages: [4, 5], snips: [] },
      // Page 5 is scanned: a row exists with no text. Page 4 is fine.
      loadDocument: async () => ({
        meta: { title: 'דוח', quarter: 'Q2' },
        pages: [
          { pageNo: 4, text: 'alpha' },
          { pageNo: 5, text: '' },
        ],
      }),
    })
  )
  assert.deepEqual(
    events.find((e) => e.type === 'documentContext'),
    { type: 'documentContext', state: 'truncated' },
    'a half-read passage reported as whole'
  )
})

test('a page with NO ROW AT ALL counts as missing, not as never asked for', async () => {
  // `getPageText` returns only the rows it finds, so a page the user marked can
  // simply be absent from the result. Absent and blank are the same loss.
  const s = docSender()
  const events = await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'q',
      todayIsrael: '2026-08-15',
      documents: { documentId: 'doc-1', pages: [4, 9], snips: [] },
      loadDocument: async () => ({
        meta: { title: 'דוח', quarter: 'Q2' },
        pages: [{ pageNo: 4, text: 'a' }],
      }),
    })
  )
  assert.deepEqual(
    events.find((e) => e.type === 'documentContext'),
    { type: 'documentContext', state: 'truncated' }
  )
})

test('BLOCKER: a SNIP on a page with no text is not a report failure — the image arrived', async () => {
  // Round 2, and the round-1 fix introduced it. `pagesToLoad` adds every snipped
  // page to the FETCH; the first version measured the state against that union,
  // so a snip of a scanned page had no text row, the difference was non-empty,
  // and the surface said "the report text could not be loaded" on the exact turn
  // the IMAGE grounding had worked. Two channels carry report content here, and a
  // state describing one of them may only be measured against what that one was
  // asked to carry.
  const s = docSender()
  const events = await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'q',
      todayIsrael: '2026-08-15',
      // Marked page 4 (readable); snipped page 77, which has no text row at all.
      documents: { documentId: 'doc-1', pages: [4], snips: [{ dataUrl: SNIP_PNG, page: 77 }] },
      loadDocument: async () => ({
        meta: { title: 'דוח', quarter: 'Q2' },
        pages: [{ pageNo: 4, text: 'a' }],
      }),
    })
  )
  assert.deepEqual(
    events.find((e) => e.type === 'documentContext'),
    { type: 'documentContext', state: 'ok' },
    'a snipped page with no prose was reported as lost report text'
  )
  assert.ok(s.blocks().some((b) => b.type === 'image'))
})

test('a SNIP-ONLY turn promises no report text, so it cannot lose any', async () => {
  // No reference block on screen — only thumbnails, and those always arrive.
  const s = docSender()
  const events = await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'q',
      todayIsrael: '2026-08-15',
      documents: { documentId: 'doc-1', pages: [], snips: [{ dataUrl: SNIP_PNG, page: 77 }] },
      loadDocument: async () => ({ meta: null, pages: [] }),
    })
  )
  assert.deepEqual(
    events.find((e) => e.type === 'documentContext'),
    { type: 'documentContext', state: 'ok' }
  )
})

test('the loader is asked for the MARKED pages AND the snipped ones', async () => {
  // The two lists are separate now; this is the one that must still be the union,
  // or a snipped page silently loses the prose that says what its number is about.
  let asked: number[] = []
  const s = docSender()
  await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'q',
      todayIsrael: '2026-08-15',
      documents: { documentId: 'doc-1', pages: [4], snips: [{ dataUrl: SNIP_PNG, page: 77 }] },
      loadDocument: async (_id, pages) => {
        asked = pages
        return { meta: null, pages: [{ pageNo: 4, text: 'a' }] }
      },
    })
  )
  assert.deepEqual(asked, [4, 77])
})

test('the documentContext event lands BEFORE the answer starts, never after it', async () => {
  const s = docSender()
  const events = await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'q',
      todayIsrael: '2026-08-15',
      documents: { documentId: 'doc-1', pages: [4], snips: [] },
      loadDocument: async () => loadedDoc(),
    })
  )
  const dc = events.findIndex((e) => e.type === 'documentContext')
  const firstDelta = events.findIndex((e) => e.type === 'delta')
  assert.ok(dc >= 0 && firstDelta >= 0)
  assert.ok(dc < firstDelta, 'the notice arrived after the answer had started')
})

test('NO attached document means NO documentContext event and a plain string turn', async () => {
  // The overwhelmingly common turn. Wrapping it in a one-element block array
  // would change the shape of every request in the repo to buy nothing.
  const s = docSender()
  const events = await collect(
    runChatLoop({
      client: s.client,
      scope: { userId: 'u1' },
      history: [],
      message: 'hi',
      todayIsrael: '2026-08-15',
    })
  )
  assert.equal(
    events.some((e) => e.type === 'documentContext'),
    false
  )
  assert.equal(typeof s.sent[0].messages[s.sent[0].messages.length - 1].content, 'string')
})
