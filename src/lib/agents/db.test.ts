import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAgent, getAgent, listAgents } from './db'

// A recording fake, not a mock library — we assert on the FILTERS that were
// applied, which is the property under test. rules/app.md M2: state the property
// in the user's terms ("another fund cannot read my agent"), not the code's.
function fakeDb(rows: any[] = []) {
  const calls: { table: string; filters: Record<string, unknown> }[] = []
  const builder = (table: string) => {
    const filters: Record<string, unknown> = {}
    const self: any = {
      select: () => self,
      insert: (v: any) => {
        calls.push({ table, filters: { insert: v } })
        return self
      },
      eq: (col: string, val: unknown) => {
        filters[col] = val
        return self
      },
      order: () => self,
      maybeSingle: async () => {
        calls.push({ table, filters })
        return { data: rows[0] ?? null, error: null }
      },
      single: async () => {
        calls.push({ table, filters })
        return { data: rows[0] ?? null, error: null }
      },
      then: (res: any) => {
        calls.push({ table, filters })
        return Promise.resolve({ data: rows, error: null }).then(res)
      },
    }
    return self
  }
  return { client: { from: builder } as any, calls }
}

test('listAgents filters by the caller, never returns everything', async () => {
  const { client, calls } = fakeDb([])
  await listAgents({ client }, 'user-a')
  assert.ok(calls.some((c) => c.table === 'agents' && c.filters.user_id === 'user-a'))
})

test('getAgent filters by BOTH the id and the caller', async () => {
  const { client, calls } = fakeDb([])
  await getAgent({ client }, 'user-a', 'agent-1')
  const c = calls.find((x) => x.table === 'agents')!
  assert.equal(c.filters.id, 'agent-1')
  // The one that matters: an id alone would let user-b read user-a's agent
  // by guessing a uuid. RLS also stops this — belt and braces, because the
  // run driver cannot carry a user session and uses the service role.
  assert.equal(c.filters.user_id, 'user-a')
})

test('createAgent stamps the owner from the argument, never from the input payload', async () => {
  const { client, calls } = fakeDb([{ id: 'x', user_id: 'user-a' }])
  await createAgent(
    { client },
    // A hostile payload naming someone else. Identity comes from the caller,
    // never from data — the same law lib/chat2/tools.ts states for tool args.
    { userId: 'user-a', name: 'n', mission: 'm', user_id: 'user-b' } as any
  )
  const insert = calls.find((c) => c.filters.insert)!.filters.insert as any
  assert.equal(insert.user_id, 'user-a')
})

test('surfaces a supabase error instead of returning an empty list', async () => {
  // Supabase NEVER THROWS — it returns { data, error }. A destructure that
  // drops `error` turns a database failure into "you have no agents", which
  // is the silent-degradation class rules/app.md forbids.
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
      }),
    }),
  } as any
  await assert.rejects(listAgents({ client }, 'user-a'), /boom/)
})
