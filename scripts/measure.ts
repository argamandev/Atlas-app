// Usage: node --import tsx scripts/measure.ts <candidate.txt> [baseline.txt]
// Scores <candidate> against the gold; if <baseline> is given, reports fixed/introduced too.
import fs from 'fs'
import path from 'path'
import { score, tokenize, lcsGoldMatched } from './lib/measure-core'

const ROOT = process.cwd()
const GOLD = path.join(ROOT, 'scripts', 'fixtures', 'ampa-q1-2026.gold.txt')

const candPath = process.argv[2]
const basePath = process.argv[3] ?? path.join(ROOT, 'scripts', 'fixtures', 'ampa-q1-2026.current.txt')
if (!candPath) { console.error('Usage: measure.ts <candidate.txt> [baseline.txt]'); process.exit(1) }

const gold = fs.readFileSync(GOLD, 'utf8')
const candidate = fs.readFileSync(candPath, 'utf8')
const baseline = fs.readFileSync(basePath, 'utf8')

const s = score(baseline, candidate, gold)
console.log('=== measure vs gold ===')
console.log(`gold tokens:         ${s.goldTokens}`)
console.log(`baseline errors:     ${s.baselineErrors}  (error rate ${(s.errorRateBaseline * 100).toFixed(1)}%)`)
console.log(`candidate errors:    ${s.candidateErrors}  (error rate ${(s.errorRateCandidate * 100).toFixed(1)}%)`)
console.log(`FIXED:               ${s.fixed}`)
console.log(`INTRODUCED:          ${s.introduced}   ${s.introduced === 0 ? '✅ (gate passes)' : '❌ (gate FAILS)'}`)
console.log(`remaining errors:    ${s.remaining}`)

// Show the gold tokens the candidate still misses, with a little context.
const g = tokenize(gold)
const gc = lcsGoldMatched(tokenize(candidate), g)
const misses = g.map((t, i) => (!gc[i] ? `${g[i - 1] ?? ''} [${t}] ${g[i + 1] ?? ''}`.trim() : null)).filter(Boolean)
if (misses.length) { console.log('\n--- still-missing gold words (context) ---'); misses.slice(0, 60).forEach(m => console.log('  ' + m)) }
