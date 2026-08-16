// scripts/agents-smoke.mjs
// Managed Agents mechanism check for Agents V1 (spec .scratch/agents-v1/spec.md).
// Proves FOUR claims the design rests on and no unit test can reach:
//   1. we can create an environment, an agent object and a memory store
//   2. a session answers a CUSTOM TOOL round-trip (spec §4 — the agent stops
//      and waits for OUR server; if this does not work, nothing else matters)
//   3. the agent can write to its memory store
//   4. a SECOND session, after the first is deleted, READS THAT BACK
//      (spec §1 — the founder's memory-at-Anthropic decision stands or falls here)
//
// Run: node scripts/agents-smoke.mjs
// Costs a few cents. Creates one environment you should KEEP (print its id into
// .env.local as ANTHROPIC_ENVIRONMENT_ID) and one agent + memory store you should
// keep for the duration of the check only.

import Anthropic from '@anthropic-ai/sdk'
import fs from 'node:fs'
import path from 'node:path'

// .env.local is not loaded outside Next, so read it the way the other scripts do —
// except that this repo uses `git worktree` as a normal part of its workflow
// (CONTEXT.md), and a worktree never carries its own .env.local; only the primary
// checkout does. So walk UP from cwd and load the first one found, instead of
// looking at cwd alone. Values already in process.env still win.
function loadLocalEnv() {
  let dir = process.cwd()
  for (;;) {
    const candidate = path.join(dir, '.env.local')
    if (fs.existsSync(candidate)) {
      for (const line of fs.readFileSync(candidate, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
      return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

if (!process.env.ANTHROPIC_API_KEY) loadLocalEnv()

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const say = (...a) => console.log(...a)

// The one fact the agent will be told and asked to remember. Deliberately
// something the model cannot know or guess, so a later "recall" cannot be a
// lucky generation — rules/app.md M2: never let a check certify an untrue premise.
const SECRET = `atlas-smoke-${process.pid}-${process.ppid}`

async function main() {
  // ---- claim 1: the three objects -----------------------------------------
  const env = await client.beta.environments.create({
    name: `atlas-agents-${Date.now()}`,
    config: { type: 'cloud', networking: { type: 'unrestricted' } },
  })
  say('environment:', env.id, '  <-- put this in .env.local as ANTHROPIC_ENVIRONMENT_ID')

  const store = await client.beta.memoryStores.create({
    name: 'atlas smoke notebook',
    description: 'Scratch notebook for the Atlas mechanism check.',
  })
  say('memory store:', store.id)

  const agent = await client.beta.agents.create({
    name: 'Atlas smoke agent',
    model: 'claude-sonnet-5',
    system:
      'You are a check harness. Follow instructions literally and briefly. ' +
      'When asked to remember something, write it to a file under your memory mount.',
    tools: [
      { type: 'agent_toolset_20260401', default_config: { enabled: true } },
      {
        type: 'custom',
        name: 'atlas_ping',
        description: 'Ask the Atlas server for a value. Returns a short string.',
        input_schema: { type: 'object', properties: {}, required: [] },
      },
    ],
  })
  say('agent:', agent.id, 'v' + agent.version)

  // ---- claims 2 + 3: custom tool round-trip, and a memory write ------------
  const first = await client.beta.sessions.create({
    agent: agent.id,
    environment_id: env.id,
    resources: [{ type: 'memory_store', memory_store_id: store.id, access: 'read_write' }],
    // Same shape src/lib/agents/budget.ts produces. Kept literal here so this
    // script stays runnable if the app code is mid-refactor.
    budget: { type: 'limit', max_list_cost: { amount: '100', currency: 'USD' } },
  })
  say('session 1:', first.id)
  say('trace: https://platform.claude.com/workspaces/default/sessions/' + first.id)

  // STREAM BEFORE SEND. The stream only delivers events emitted after it opens;
  // send-then-stream loses the early ones. This ordering is spec §4 step 2.
  const stream1 = await client.beta.sessions.events.stream(first.id)
  await client.beta.sessions.events.send(first.id, {
    events: [
      {
        type: 'user.message',
        content: [
          {
            type: 'text',
            text:
              'Call the atlas_ping tool exactly once. Then write the value it returns ' +
              'into a file called note.md on your memory mount. Then say DONE.',
          },
        ],
      },
    ],
  })

  const idleStopReasons = []
  let toolRoundTripped = false
  for await (const ev of stream1) {
    if (ev.type === 'session.error') say('  session.error:', JSON.stringify(ev.error ?? ev))
    if (ev.type === 'agent.custom_tool_use' && ev.name === 'atlas_ping') {
      toolRoundTripped = true
      say('  custom tool called; answering from OUR side')
      await client.beta.sessions.events.send(first.id, {
        events: [
          {
            type: 'user.custom_tool_result',
            custom_tool_use_id: ev.id,
            content: [{ type: 'text', text: SECRET }],
          },
        ],
      })
    }
    if (ev.type === 'session.status_idle') idleStopReasons.push(`session 1: ${ev.stop_reason?.type}`)
    if (ev.type === 'session.status_terminated') break
    // Idle is NOT the end — a session idles between parallel tools and whenever it
    // is waiting on us. Only a non-requires_action stop_reason is terminal.
    if (ev.type === 'session.status_idle' && ev.stop_reason?.type !== 'requires_action') break
  }
  say('claim 2 — custom tool round-trip:', toolRoundTripped ? 'PASS' : 'FAIL')

  const stored = await client.beta.memoryStores.memories.list(store.id, { view: 'full' })
  const wrote = JSON.stringify(stored.data ?? stored).includes(SECRET)
  say('claim 3 — agent wrote to memory:', wrote ? 'PASS' : 'FAIL')

  // Delete session 1 exactly as a finished run will (spec §4 step 4): the SESSION
  // goes, the MEMORY STORE stays. That distinction is the whole point of claim 4.
  await client.beta.sessions.delete(first.id)

  // ---- claim 4: memory outlives the session -------------------------------
  const second = await client.beta.sessions.create({
    agent: agent.id,
    environment_id: env.id,
    resources: [{ type: 'memory_store', memory_store_id: store.id, access: 'read_write' }],
    budget: { type: 'limit', max_list_cost: { amount: '100', currency: 'USD' } },
  })
  say('session 2:', second.id)
  const stream2 = await client.beta.sessions.events.stream(second.id)
  await client.beta.sessions.events.send(second.id, {
    events: [
      {
        type: 'user.message',
        content: [
          {
            type: 'text',
            text: 'Read note.md from your memory mount and reply with its contents verbatim.',
          },
        ],
      },
    ],
  })

  let recalled = ''
  for await (const ev of stream2) {
    if (ev.type === 'session.error') say('  session.error:', JSON.stringify(ev.error ?? ev))
    if (ev.type === 'agent.message') {
      for (const b of ev.content) if (b.type === 'text') recalled += b.text
    }
    if (ev.type === 'session.status_idle') idleStopReasons.push(`session 2: ${ev.stop_reason?.type}`)
    if (ev.type === 'session.status_terminated') break
    if (ev.type === 'session.status_idle' && ev.stop_reason?.type !== 'requires_action') break
  }
  const remembered = recalled.includes(SECRET)
  say('claim 4 — memory survived the session:', remembered ? 'PASS' : 'FAIL')
  if (!remembered) say('  agent said:', JSON.stringify(recalled.slice(0, 300)))

  await client.beta.sessions.delete(second.id)

  say('')
  say('session.status_idle stop reasons observed:')
  for (const r of idleStopReasons) say('  ' + r)
  say('')
  say('KEEP:   environment', env.id)
  say('DELETE: memory store', store.id, 'and agent', agent.id, '— smoke scratch, not app data')
  say('NOTE:   archive is PERMANENT on all of these and there is no unarchive (spec §9.5).')
}

main().catch((e) => {
  console.error('smoke failed:', e?.status ?? '', e?.message ?? e)
  process.exit(1)
})
