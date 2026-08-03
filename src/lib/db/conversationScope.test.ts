import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMissingTable, resolveProjectId } from './conversationScope'

// Covers what the chat-wiring commit (9f5da70) introduced and shipped with no
// test: which project a new chat belongs to, and what counts as "the
// conversations table is gone" now that this module references a column which
// can be absent.
//
// The identity half of this module is GONE — it used to take a `realUserId` and
// return `realUserId ?? DEMO_USER_ID`, and one of the tests below asserted that
// fallback as CORRECT behaviour. Both were deleted at the merge gate: the route
// now refuses an unidentified caller before this function is reached. A test
// that pins a hole in place is worse than no test, because it makes removing the
// hole look like a regression.

test('a real projectId is carried through', () => {
  assert.equal(resolveProjectId({ projectId: 'p1' }), 'p1')
})

test('an untrusted body cannot turn a non-string or empty projectId into a project chat', () => {
  for (const bad of [
    { projectId: '' },
    { projectId: 123 },
    { projectId: null },
    { projectId: {} },
    { projectId: ['p1'] },
    { projectId: true },
    {},
    null,
    undefined,
  ]) {
    assert.equal(
      resolveProjectId(bad),
      null,
      `${JSON.stringify(bad) ?? 'undefined'} must not be treated as a project`
    )
  }
})

test('an ordinary chat is simply not in a project', () => {
  assert.equal(resolveProjectId({ companyId: 'c1' }), null)
})

test('a genuinely absent table is recognised, by code and by message', () => {
  assert.equal(isMissingTable({ code: '42P01' }, 'chat_conversations'), true)
  assert.equal(isMissingTable({ code: 'PGRST205' }, 'chat_conversations'), true)
  assert.equal(
    isMissingTable({ message: 'relation "public.chat_conversations" does not exist' }, 'chat_conversations'),
    true
  )
  assert.equal(
    isMissingTable(
      { message: "Could not find the table 'public.chat_conversations' in the schema cache" },
      'chat_conversations'
    ),
    true
  )
})

test('a missing COLUMN must not be read as a missing table', () => {
  // The regression this exists for: setting the flag downgrades every
  // conversation for the rest of the process to memory, with no error shown —
  // so "column project_id does not exist" would silently cost the user their
  // whole history until restart.
  assert.equal(
    isMissingTable(
      { code: '42703', message: 'column chat_conversations.project_id does not exist' },
      'chat_conversations'
    ),
    false
  )
  assert.equal(
    isMissingTable(
      {
        code: 'PGRST204',
        message: "Could not find the 'project_id' column of 'chat_conversations' in the schema cache",
      },
      'chat_conversations'
    ),
    false
  )
})

test('a message about a DIFFERENT relation is not evidence about this one', () => {
  assert.equal(
    isMissingTable({ message: 'relation "public.projects" does not exist' }, 'chat_conversations'),
    false
  )
})

test('no error is not a missing table', () => {
  assert.equal(isMissingTable(null, 'chat_conversations'), false)
  assert.equal(isMissingTable({}, 'chat_conversations'), false)
})
