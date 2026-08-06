import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DOCUMENT_EVENT_IDS,
  SCHEDULE_EVENT_IDS,
  docTypeFor,
  periodFor,
  isDocumentEvent,
  isScheduleEvent,
} from './events'

test('the whitelist is exactly the five analyst-relevant kinds', () => {
  assert.deepEqual(
    [...DOCUMENT_EVENT_IDS].sort((a, b) => a - b),
    [101, 104, 105, 106, 270]
  )
})

// THE LINE THE CALENDAR AND LIVE-CALL CONSUMERS WILL READ. A conference call is
// news about when something happens, not a document to put on a shelf.
test('a conference call is schedule, never a document', () => {
  assert.equal(isDocumentEvent([233]), false)
  assert.equal(isScheduleEvent([233]), true)
  assert.equal(docTypeFor([233]), null)
  assert.ok(SCHEDULE_EVENT_IDS.has(233))
})

test('a presentation wins over the report it accompanies', () => {
  assert.equal(docTypeFor([104, 270]), 'slides')
  assert.equal(docTypeFor([101, 270]), 'slides')
  assert.equal(docTypeFor([101]), 'report')
  assert.equal(docTypeFor([106]), 'report')
})

test('anything unrecognised is excluded rather than guessed at', () => {
  assert.equal(docTypeFor([114]), null) // מצבת התחיבויות
  assert.equal(docTypeFor([282]), null) // תיקון טעות סופר
  assert.equal(docTypeFor([]), null)
})

// THE YEAR COMES FROM THE TITLE WHEN THE ISSUER STATED ONE, because the case
// that matters is precisely the one where publication year != report year.
test('the period is read from the Hebrew title, falling back to the publication year', () => {
  assert.equal(periodFor([101], 'דוח תקופתי ושנתי לשנת 2024', '2025-03-30T00:00:00'), 'FY 2024')
  assert.equal(
    periodFor([104, 270], 'מצגת משקיעים  - דוחות כספיים לרבעון הראשון של שנת 2026', '2026-05-27T00:00:00'),
    'Q1 2026'
  )
  assert.equal(periodFor([106], null, '2025-11-30T00:00:00'), 'Q3 2025')
  assert.equal(periodFor([105], 'דוח רבעון 2/חצי שנתי לשנת 2025', '2025-08-27T00:00:00'), 'Q2 2025')
})
