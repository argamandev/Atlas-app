import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLlmPrompt, LLM_TARGETS } from './llmHandoff'

test('buildLlmPrompt: includes company, quarter, and transcript text', () => {
  const p = buildLlmPrompt('Tigbur', 'Q4 2025', 'דובר א: שלום\n\nדובר ב: תודה')
  assert.match(p, /Tigbur/)
  assert.match(p, /Q4 2025/)
  assert.match(p, /דובר א: שלום/)
})

test('LLM_TARGETS: three known targets with urls', () => {
  assert.deepEqual(LLM_TARGETS.map((t) => t.key), ['chatgpt', 'claude', 'gemini'])
  for (const t of LLM_TARGETS) assert.match(t.url, /^https:\/\//)
})
