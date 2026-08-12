#!/usr/bin/env node
// The environment's health in one command:  npm run env:health
//
// Prints what a session is handed and how many of its laws nothing is stopping.
// The unenforced count is the metric ADR-0002 exists to drive down — not "the
// lessons are better written" but "the system can see whether the last one worked".
//
// Reads the same manifest the battery asserts against (scripts/lib/env-manifest.mjs),
// so this number and the test can never disagree.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ALWAYS_ON,
  LAW_FORM_EXEMPT,
  REPO_ROOT,
  STATUS_FILE,
  STATUS_LINE_CAP,
  TOKEN_BUDGET,
  allLaws,
  alwaysOnSizes,
  unenforced,
} from './lib/env-manifest.mjs'

const read = (f) => readFileSync(join(REPO_ROOT, f), 'utf8')

console.log('ALWAYS-ON SET')
const { files, total } = alwaysOnSizes()
for (const [file, t] of files) console.log(`  ${String(t).padStart(6)}  ${file}`)
console.log(`  ${String(total).padStart(6)}  TOTAL  (budget ${TOKEN_BUDGET}, ${TOKEN_BUDGET - total} spare)`)

// Read time a human would need, not just tokens a model ingests. The founder retired the
// timed-read ritual 2026-08-12 ("THERE IS NO WAY I WILL SIT AND READ THIS") — this estimate
// is its automatic replacement. Words / 200 wpm; the bar the ritual carried was 10 minutes.
// Over the bar means the set regrew past human readability, whatever the token budget says;
// the fix is shrinking the set, never asking a human to prove it by stopwatch.
const words = Object.keys(ALWAYS_ON)
  .map((f) => (read(f).match(/\S+/g) ?? []).length)
  .reduce((a, b) => a + b, 0)
const minutes = Math.round(words / 200)
console.log(`\n  est. founder read time: ~${minutes} min (${words} words at 200 wpm; bar: 10 min)`)

const statusLines = read(STATUS_FILE).split(/\r?\n/).length
console.log(`\n${STATUS_FILE}: ${statusLines} lines (cap ${STATUS_LINE_CAP})`)

const laws = allLaws()
const open = unenforced(laws)
const by = (kind) => laws.filter((l) => l.enforcement.kind === kind).length

// Name what was scanned and what was not. A bare "26 laws" reads as a survey of the
// whole always-on set, and it is not one — four of the five files state their rules
// in prose and are invisible here. An unstated exemption is how a number starts
// meaning something other than what its reader thinks (M1).
const scanned = Object.keys(ALWAYS_ON).filter((f) => !(f in LAW_FORM_EXEMPT))
console.log(`\nLAWS  (scanned: ${scanned.join(', ')})`)
console.log(`  ${laws.length} total`)
console.log(`  ${by('mechanism')} carry a mechanism`)
console.log(`  ${by('unenforceable')} declared UNENFORCEABLE with a reason`)
console.log(`  ${by('none')} declared ENFORCED none`)
console.log(`  ${by('partial')} declared ENFORCED partially`)
console.log(`  not scanned: ${Object.keys(LAW_FORM_EXEMPT).join(', ')}`)

// ENFORCED none + ENFORCED partially. ADR-0002 first framed this metric as
// `grep -c "ENFORCED none"`; that undercounts, because a law enforced "for one
// surface" is unenforced for every other one — which is exactly what app.md says
// about bidi, the repo's most-repeated defect. The ADR records the wider definition.
console.log(`\nUNENFORCED LAWS: ${open.length}   <-- this is the number that must trend down`)
for (const l of open) console.log(`  ${l.file}:${l.line}  [${l.enforcement.kind}]  ${l.title}`)
