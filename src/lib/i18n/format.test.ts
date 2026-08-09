import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatTime,
  formatDate,
  formatRelativeDays,
  greetingKey,
  israelDayKey,
  israelMonthParts,
} from './format'

// ── Israel time, always ──────────────────────────────────────────────────────
//
// FOUNDER DECISION 2026-08-09, filed in cross-cutting: a call at 10:00 Israel
// time reads 10:00 for every viewer in every timezone. TASE and Israeli issuers
// publish in Israel time; a per-viewer value would mean Home, the calendar and
// the company page can disagree about the same event.
//
// ⚠ WHY THESE TESTS EXIST — THIS SHIPPED TO PRODUCTION AND WAS FOUND BY LOOKING.
// `formatTime` pinned no timeZone, so it used the RUNTIME's. Home is a Server
// Component: it formatted on Railway (UTC) and handed the client a finished
// string the browser never re-formats, so www.timlul-ai.com listed every
// investor call THREE HOURS EARLY — יעקב פיננסים's 10:00 call read 07:00 —
// while the calendar, a client component, rendered the same row correctly.
// Measured live 2026-08-09 against the DB.
//
// These assertions are absolute: they must hold whatever TZ the test process
// runs in, which is the whole property that was missing.

const CALL = '2026-08-10T07:00:00Z' // 10:00 in Jerusalem (UTC+3 in August)
const WINTER = '2026-01-14T08:00:00Z' // 10:00 in Jerusalem (UTC+2 in January)

test('THE PRODUCTION BUG: a 10:00 Israel call never renders as its UTC hour', () => {
  assert.equal(formatTime(CALL, 'en'), '10:00')
  assert.equal(formatTime(CALL, 'he'), '10:00')
})

test('the offset is taken from the date, not hardcoded — winter is UTC+2', () => {
  // A fixed +3 would render 11:00 here. Israel observes DST; only a real
  // timezone gets both right.
  assert.equal(formatTime(WINTER, 'en'), '10:00')
})

test('a report bucketed at Israel midnight belongs to THAT day, not the day before', () => {
  // Report publications carry no time, so they are stored at midnight Israel.
  // 2026-08-27T21:00Z IS 2026-08-28T00:00 in Jerusalem. Formatted in UTC — or
  // in any timezone west of Israel — it reads as the 27th, a day early.
  assert.equal(formatDate('2026-08-27T21:00:00Z', 'en'), 'Aug 28, 2026')
  assert.equal(israelDayKey('2026-08-27T21:00:00Z'), '2026-08-28')
})

test('a late-evening Israel event does not slide into the next day', () => {
  // 23:30 Israel = 20:30Z. A timezone EAST of Israel would push this to the 11th.
  assert.equal(israelDayKey('2026-08-10T20:30:00Z'), '2026-08-10')
  assert.equal(formatTime('2026-08-10T20:30:00Z', 'en'), '23:30')
})

test('israelMonthParts reports the Israel year and month of an instant', () => {
  assert.deepEqual(israelMonthParts('2026-08-27T21:00:00Z'), { year: 2026, month: 7 })
  // 2026-01-01T00:00 Israel is 2025-12-31T22:00Z — the year boundary is the
  // sharpest case, and a UTC read puts this event in the wrong YEAR.
  assert.deepEqual(israelMonthParts('2025-12-31T22:00:00Z'), { year: 2026, month: 0 })
})

test("relative days count Israel days, not the runtime's", () => {
  // "now" is 2026-08-09 23:00 Israel (20:00Z). The call is 2026-08-10 10:00
  // Israel. That is TOMORROW in Israel — but in UTC "now" is still the 9th at
  // 20:00 and the call is the 10th, which happens to agree; the case that
  // breaks is a viewer west of Israel, where local "now" is still the 9th
  // morning and the Israel day has already turned.
  const now = new Date('2026-08-09T20:00:00Z')
  assert.equal(formatRelativeDays(CALL, 'en', now), 'tomorrow')
})

test('same Israel day is "today" even across a UTC date boundary', () => {
  // now = 2026-08-10 02:00 Israel (2026-08-09 23:00Z — still the 9th in UTC).
  // The call is later the same Israel day, so it is TODAY, not tomorrow.
  const now = new Date('2026-08-09T23:00:00Z')
  assert.equal(formatRelativeDays(CALL, 'en', now), 'today')
})

test("the greeting follows Israel hours, not the server's", () => {
  // 2026-08-09T20:00Z is 23:00 in Israel — evening. A server in UTC would say
  // "Good evening" too here, so the discriminating case is the other way:
  // 06:00Z is 09:00 Israel (morning) but would be morning in UTC as well.
  // The real split: 2026-08-09T10:00Z = 13:00 Israel (afternoon) vs 10:00 UTC
  // (morning).
  assert.equal(greetingKey(new Date('2026-08-09T10:00:00Z')), 'afternoon')
  assert.equal(greetingKey(new Date('2026-08-09T20:00:00Z')), 'evening')
  assert.equal(greetingKey(new Date('2026-08-09T04:00:00Z')), 'morning')
})
