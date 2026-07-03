// scripts/compare-live-quality.ts — IVRIT-pipeline transcript vs Recall captions, same audio.
// Also compares vs a whole-file IVRIT reference (scripts/out/ivrit-wholefile.txt, if present) —
// same model without chunking, so ours-vs-wholefile disagreement isolates the cost of chunking.
// Run: node --import tsx scripts/compare-live-quality.ts
import fs from 'fs'
import { tokenize, lcsGoldMatched } from './lib/measure-core'

const OURS = process.env.OURS || 'scripts/out/ivrit-lines.jsonl'
const RECALL =
  process.env.RECALL ||
  'C:/Users/Sagi/Desktop/Atlas/scripts/out/sessions/2026-07-01-tamis-live/broadcast-lines.jsonl'
const WHOLEFILE = process.env.WHOLEFILE || 'scripts/out/ivrit-wholefile.txt'

const readLines = (p: string) =>
  fs
    .readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
const ourText = readLines(OURS)
  .map((l: { raw: string }) => l.raw)
  .join(' ')
const recallText = readLines(RECALL)
  .map((l: { raw: string }) => l.raw)
  .join(' ')

const a = tokenize(ourText)
const g = tokenize(recallText)
const inBoth = lcsGoldMatched(a, g).filter(Boolean).length
console.log(`IVRIT tokens: ${a.length} | Recall tokens: ${g.length} | LCS overlap: ${inBoth}`)
console.log(
  `agreement vs Recall: ${((100 * inBoth) / g.length).toFixed(1)}% | vs ours: ${((100 * inBoth) / a.length).toFixed(1)}%`
)

// show the first 10 disagreement windows for the human read
const matched = lcsGoldMatched(a, g)
let shown = 0
for (let i = 0; i < g.length && shown < 10; i++) {
  if (!matched[i]) {
    console.log(`  recall-only @${i}: …${g.slice(Math.max(0, i - 3), i + 4).join(' ')}…`)
    shown++
  }
}

// third reference: whole-file IVRIT (no chunking) — isolates the cost of chunking.
if (fs.existsSync(WHOLEFILE)) {
  const wholeText = fs.readFileSync(WHOLEFILE, 'utf8')
  const w = tokenize(wholeText)
  const inBothW = lcsGoldMatched(a, w).filter(Boolean).length
  console.log(`\nWholefile tokens: ${w.length} | LCS overlap (ours vs wholefile): ${inBothW}`)
  console.log(
    `agreement vs wholefile: ${((100 * inBothW) / w.length).toFixed(1)}% | vs ours: ${((100 * inBothW) / a.length).toFixed(1)}%`
  )

  const matchedW = lcsGoldMatched(a, w)
  let shownW = 0
  for (let i = 0; i < w.length && shownW < 10; i++) {
    if (!matchedW[i]) {
      console.log(`  wholefile-only @${i}: …${w.slice(Math.max(0, i - 3), i + 4).join(' ')}…`)
      shownW++
    }
  }
} else {
  console.log(`\n(no wholefile reference at ${WHOLEFILE} — run scripts/make-wholefile-reference.ts first)`)
}
