import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMissingTable, resolveConversationScope } from './conversationScope'
import { DEMO_USER_ID } from '@/lib/api/types'

// Covers the two rules the chat-wiring commit (9f5da70) introduced and shipped
// with no test: who may open a chat inside a project, and what counts as "the
// conversations table is gone" now that this module references a column which
// can be absent.

test('a project chat requires a real user, not the demo fallback', () => {
  const r = resolveConversationScope(null, { projectId: 'p1' })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.status, 401)
})

test('a signed-in user may open a chat inside a project', () => {
  const r = resolveConversationScope('u1', { projectId: 'p1' })
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.userId, 'u1')
  assert.equal(r.ok && r.projectId, 'p1')
})

test('an ordinary chat still falls back to the demo id — that path is not this chapter to change', () => {
  const r = resolveConversationScope(null, { companyId: 'c1' })
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.userId, DEMO_USER_ID)
  assert.equal(r.ok && r.projectId, null)
})

test('a non-string or empty projectId is not a project chat, and must not 401 an ordinary one', () => {
  for (const bad of [{ projectId: '' }, { projectId: 123 }, { projectId: null }, {}, null]) {
    const r = resolveConversationScope(null, bad)
    assert.equal(r.ok, true, `${JSON.stringify(bad)} must not be treated as a project`)
    assert.equal(r.ok && r.projectId, null)
  }
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
