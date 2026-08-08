import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zonedWallClockToUtc, toScheduleEvent, dedupeSchedule, type ScheduleEvent } from './schedule'
import type { MayaScheduleRow } from './types'

const row = (o: Partial<MayaScheduleRow>): MayaScheduleRow => ({
  scheduledDate: '2026-08-10',
  scheduledTime: '10:00:00',
  financialReportTypeId: 1,
  issuerId: 1460,
  year: 2026,
  periodTypeId: 2,
  timeZone: 'IL',
  url: null,
  ...o,
})

// ── the timezone conversion, which is where being wrong is invisible ─────────

test('Israeli summer time is UTC+3', () => {
  // 2026-08-10 is inside Israel DST (IDT, +03:00).
  assert.equal(zonedWallClockToUtc('2026-08-10', '10:00:00', 'Asia/Jerusalem'), '2026-08-10T07:00:00.000Z')
})

test('Israeli winter time is UTC+2 — the same wall clock is a DIFFERENT instant', () => {
  // 2026-01-15 is standard time (IST, +02:00). A fixed offset would put this an
  // hour out, and an hour is enough to show a call on the wrong side of an hour
  // boundary without anything looking broken.
  assert.equal(zonedWallClockToUtc('2026-01-15', '10:00:00', 'Asia/Jerusalem'), '2026-01-15T08:00:00.000Z')
})

test('US eastern summer time is UTC-4', () => {
  assert.equal(zonedWallClockToUtc('2026-08-10', '08:30:00', 'America/New_York'), '2026-08-10T12:30:00.000Z')
})

test('US eastern winter time is UTC-5', () => {
  assert.equal(zonedWallClockToUtc('2026-01-15', '08:30:00', 'America/New_York'), '2026-01-15T13:30:00.000Z')
})

test('the two zones disagree by seven hours in summer — the error this guards', () => {
  const israeli = zonedWallClockToUtc('2026-08-10', '08:30:00', 'Asia/Jerusalem')
  const newYork = zonedWallClockToUtc('2026-08-10', '08:30:00', 'America/New_York')
  const gapHours = (Date.parse(newYork) - Date.parse(israeli)) / 3_600_000
  assert.equal(gapHours, 7)
})

test('a wall clock immediately after a DST spring-forward resolves to one instant', () => {
  // Israel springs forward on the last Friday of March. 03:00 on the 28th is
  // safely after the transition; the two correction passes must settle here.
  const iso = zonedWallClockToUtc('2026-03-28', '03:00:00', 'Asia/Jerusalem')
  assert.match(iso, /^2026-03-28T00:00:00\.000Z$/)
})

// ── row → event ──────────────────────────────────────────────────────────────

test('a conference call keeps its time and is marked known', () => {
  const e = toScheduleEvent(row({}))!
  assert.equal(e.kind, 'call')
  assert.equal(e.timeKnown, true)
  assert.equal(e.scheduledAtUtc, '2026-08-10T07:00:00.000Z')
  assert.equal(e.quarter, 'Q2 2026')
})

test('a report publication has NO time and says so', () => {
  // Measured: 0 of 472 publications carry a time. Storing midnight silently
  // would make the UI print a clock nobody published.
  const e = toScheduleEvent(row({ financialReportTypeId: 2, scheduledTime: null, timeZone: null }))!
  assert.equal(e.kind, 'report')
  assert.equal(e.timeKnown, false)
  // midnight Israel time on the published date, in August = 21:00Z the day before
  assert.equal(e.scheduledAtUtc, '2026-08-09T21:00:00.000Z')
})

test('a US-time call is not read as Israeli', () => {
  const e = toScheduleEvent(row({ timeZone: 'US', scheduledTime: '08:30:00' }))!
  assert.equal(e.scheduledAtUtc, '2026-08-10T12:30:00.000Z')
})

test('a time with no zone is treated as UNKNOWN, not assumed Israeli', () => {
  // 2 of 925 rows are this shape. A guess and a fact must not look alike.
  const e = toScheduleEvent(row({ timeZone: null }))!
  assert.equal(e.timeKnown, false)
})

test('a conference call missing its clock is marked unknown', () => {
  // Exactly one such row existed on 2026-08-09.
  const e = toScheduleEvent(row({ scheduledTime: null }))!
  assert.equal(e.kind, 'call')
  assert.equal(e.timeKnown, false)
})

test('an unusable date yields nothing rather than a wrong day', () => {
  assert.equal(toScheduleEvent(row({ scheduledDate: '' })), null)
  assert.equal(toScheduleEvent(row({ scheduledDate: '10/08/2026' })), null)
})

test('an unknown period id leaves the quarter empty instead of inventing one', () => {
  const e = toScheduleEvent(row({ periodTypeId: 99 }))!
  assert.equal(e.quarter, '')
})

test('every period id the feed publishes maps to a label', () => {
  const labels = [1, 2, 3, 4].map((id) => toScheduleEvent(row({ periodTypeId: id }))!.quarter)
  assert.deepEqual(labels, ['Q1 2026', 'Q2 2026', 'Q3 2026', 'FY 2026'])
})

// ── dedupe ───────────────────────────────────────────────────────────────────

const ev = (o: Partial<ScheduleEvent>): ScheduleEvent => ({
  issuerId: 281,
  kind: 'call',
  scheduledAtUtc: '2026-04-13T05:30:00.000Z',
  timeKnown: true,
  quarter: 'Q1 2026',
  mayaYear: 2026,
  mayaPeriodTypeId: 1,
  mayaReportTypeId: 1,
  sourceUrl: null,
  ...o,
})

test('a rescheduled call keeps the LATER date and reports the one it dropped', () => {
  // The real ICL case: Q1 2026 listed on both 13 April and 13 May.
  const april = ev({})
  const may = ev({ scheduledAtUtc: '2026-05-13T05:30:00.000Z' })
  const { kept, superseded } = dedupeSchedule([april, may])
  assert.equal(kept.length, 1)
  assert.equal(kept[0]!.scheduledAtUtc, '2026-05-13T05:30:00.000Z')
  assert.equal(superseded.length, 1)
  assert.equal(superseded[0]!.scheduledAtUtc, '2026-04-13T05:30:00.000Z')
})

test('order of arrival does not change the winner', () => {
  const april = ev({})
  const may = ev({ scheduledAtUtc: '2026-05-13T05:30:00.000Z' })
  assert.equal(dedupeSchedule([may, april]).kept[0]!.scheduledAtUtc, '2026-05-13T05:30:00.000Z')
})

test('a call and a publication for the same quarter are BOTH kept', () => {
  // 357 issuer+periods have both. They are complementary, not duplicates —
  // collapsing them would delete every report date the calendar exists to show.
  const call = ev({ mayaReportTypeId: 1 })
  const pub = ev({ mayaReportTypeId: 2, kind: 'report', timeKnown: false })
  assert.equal(dedupeSchedule([call, pub]).kept.length, 2)
})

test('different issuers never collapse into each other', () => {
  assert.equal(dedupeSchedule([ev({ issuerId: 1 }), ev({ issuerId: 2 })]).kept.length, 2)
})

test('nothing is silently lost — kept plus superseded equals what went in', () => {
  const input = [ev({}), ev({ scheduledAtUtc: '2026-05-13T05:30:00.000Z' }), ev({ issuerId: 99 })]
  const { kept, superseded } = dedupeSchedule(input)
  assert.equal(kept.length + superseded.length, input.length)
})
