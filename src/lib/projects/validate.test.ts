import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCreate, parsePatch, parseSourcePatch, NAME_MAX, TEXT_MAX } from './validate'

test('a project needs a non-empty name', () => {
  assert.equal(parseCreate({ name: '' }).ok, false)
  assert.equal(parseCreate({ name: '   ' }).ok, false)
  assert.equal(parseCreate({}).ok, false)
  assert.equal(parseCreate(null).ok, false)
})

test('a name is trimmed rather than stored with its whitespace', () => {
  const ok = parseCreate({ name: '  Shipping sector  ' })
  assert.equal(ok.ok, true)
  assert.equal(ok.ok && ok.value.name, 'Shipping sector')
})

test('oversized input is refused rather than silently truncated', () => {
  assert.equal(parseCreate({ name: 'a'.repeat(NAME_MAX + 1) }).ok, false)
  assert.equal(parsePatch({ instructions: 'a'.repeat(TEXT_MAX + 1) }).ok, false)
  assert.equal(parsePatch({ memory: 'a'.repeat(TEXT_MAX + 1) }).ok, false)
  assert.equal(parseSourcePatch({ body: 'a'.repeat(TEXT_MAX + 1) }).ok, false)
})

test('a patch accepts exactly the four editable fields', () => {
  const p = parsePatch({ name: 'x', pinned: true, instructions: 'i', memory: 'm' })
  assert.equal(p.ok, true)
  assert.deepEqual(p.ok && p.value, { name: 'x', pinned: true, instructions: 'i', memory: 'm' })
})

test('ownership cannot be reassigned through a patch', () => {
  // user_id is not an editable field, so a body carrying only that is refused
  // outright rather than applying nothing and reporting success.
  const bad = parsePatch({ user_id: 'someone-else' })
  assert.equal(bad.ok, false)
})

test('an empty patch is refused', () => {
  assert.equal(parsePatch({}).ok, false)
  assert.equal(parsePatch(null).ok, false)
})

test('pinned must actually be a boolean', () => {
  assert.equal(parsePatch({ pinned: 'true' }).ok, false)
  assert.equal(parsePatch({ pinned: 1 }).ok, false)
  assert.equal(parsePatch({ pinned: false }).ok, true)
})

test('instructions and memory may be cleared to empty strings', () => {
  const p = parsePatch({ instructions: '', memory: '' })
  assert.equal(p.ok, true)
  assert.deepEqual(p.ok && p.value, { instructions: '', memory: '' })
})

test('a source patch accepts name and body, and an empty body is a real edit', () => {
  assert.equal(parseSourcePatch({ body: '' }).ok, true)
  assert.equal(parseSourcePatch({ name: 'Bidder brief' }).ok, true)
  assert.equal(parseSourcePatch({}).ok, false)
})

test('a source name cannot be blanked', () => {
  assert.equal(parseSourcePatch({ name: '   ' }).ok, false)
})
