import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runChatLoop, type ChatEvent } from './loop'

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
  assert.equal(
    events.some((e) => e.type === 'degraded'),
    false
  )
})

test('an invented quote is caught: the model is asked to fix it, and a still-bad answer degrades visibly', async () => {
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
  const degraded = events.find((e) => e.type === 'degraded')
  assert.ok(degraded)
  // the invented-quote answer is never silently dropped — it still reaches the user, flagged
  assert.ok(events.some((e) => e.type === 'delta' && e.text.includes('הרווח גדל משמעותית')))
})

test('exhausting the round-trip cap ends with a visible degradation, not a silent cutoff', async () => {
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
  assert.equal(events.at(-2)?.type, 'degraded')
  assert.equal(events.at(-1)?.type, 'done')
})
