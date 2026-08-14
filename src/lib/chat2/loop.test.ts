import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runChatLoop, TERMINAL_EVENTS, type ChatEvent } from './loop'

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
  assert.deepEqual(events, [{ type: 'delta', text: 'שלום' }, { type: 'done' }])
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
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'error')
  assert.equal(
    events.some((e) => e.type === 'delta'),
    false
  )
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

test('an invented quote is caught: the model is asked to fix it, and a still-bad answer ends INCOMPLETE', async () => {
  const client = fakeClient([
    {
      content: [{ type: 'tool_use', id: 't1', name: 'search_corpus', input: { query: 'רבעון' } }],
      stop_reason: 'tool_use',
    },
    {
      content: [{ type: 'text', text: 'לפי הדוח, "הרווח שולש פי שלוש" ברבעון.' }],
      stop_reason: 'end_turn',
    },
    // model is told to fix it and tries again, still wrong
    {
      content: [{ type: 'text', text: 'לפי הדוח, "הרווח גדל משמעותית" ברבעון.' }],
      stop_reason: 'end_turn',
    },
  ])
  const handlers = {
    async search_corpus() {
      return { content: 'ההכנסות גדלו ברבעון השני, ללא אזכור לרווח' }
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
  // The turn must NOT end in `done`: an answer carrying a quote that could not be
  // verified is not a clean finish, and `done` is the only event that says it is.
  assert.equal(events.at(-1)?.type, 'incomplete')
  // the invented-quote answer is never silently dropped — it still reaches the user, flagged
  assert.ok(events.some((e) => e.type === 'delta' && e.text.includes('הרווח גדל משמעותית')))
  assert.equal(
    events.some((e) => e.type === 'done'),
    false
  )
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

test('a Hebrew gershayim quote is extracted and verified like any other', async () => {
  // The extractor was blind to `״` while its own comment claimed it, and while
  // citations.ts already normalised it — so a Hebrew-punctuated invented quote
  // passed as though it had been checked.
  const client = fakeClient([
    {
      content: [{ type: 'tool_use', id: 't1', name: 'search_corpus', input: { query: 'x' } }],
      stop_reason: 'tool_use',
    },
    { content: [{ type: 'text', text: 'לפי הדוח, ״הרווח שולש פי שלוש״ ברבעון.' }], stop_reason: 'end_turn' },
    { content: [{ type: 'text', text: 'לפי הדוח, ״עדיין לא נכון״ ברבעון.' }], stop_reason: 'end_turn' },
  ])
  const handlers = {
    async search_corpus() {
      return { content: 'ההכנסות גדלו ברבעון השני, ללא אזכור לרווח' }
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
})

test('a citation failure on the LAST round-trip reports the citation, not the cap', async () => {
  // Previously the retry was issued with no round-trip left to land in, so the
  // answer was discarded entirely and the tail blamed the round-trip limit for
  // what was actually a citation failure — the wrong cause, which app.md warns
  // sends a user to retry forever against a problem they cannot fix.
  const toolTurn = {
    content: [{ type: 'tool_use', id: 't', name: 'search_corpus', input: {} }],
    stop_reason: 'tool_use',
  }
  const client = fakeClient([
    toolTurn,
    toolTurn,
    toolTurn,
    { content: [{ type: 'text', text: 'לפי הדוח, "משפט מומצא לגמרי" ברבעון.' }], stop_reason: 'end_turn' },
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
  const last = events.at(-1)
  assert.equal(last?.type, 'incomplete')
  assert.match((last as { reason: string }).reason, /quoted claim/)
  // and the answer text is not thrown away
  assert.ok(events.some((e) => e.type === 'delta' && e.text.includes('משפט מומצא')))
})
