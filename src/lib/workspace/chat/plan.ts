// ─────────────────────────────────────────────────────────────────────────────
// READ WHAT THE QUESTION NEEDS, NOT THE WHOLE SHELF.
//
// Founder, 2026-08-05: *"we need to build a smart token efficient workflow
// inside the workspace."*
//
// WHAT IT REPLACES, and why it was expensive in both senses. `buildContext`
// divided a 40,000-character budget EVENLY across every file on the shelf and
// sent the FIRST N characters of each, on every single turn. Two consequences,
// and the second is worse than the first:
//
//   · every question paid for the entire shelf, whether it needed one file or
//     five — and it paid again on the next turn, and the one after;
//   · a question about minute 40 of a two-hour call was answered from that
//     call's first eight thousand characters. The model was not short of
//     tokens; it was reading the wrong ones, confidently.
//
// So the shape here is SELECT, THEN READ:
//
//   1. Cut every source into labelled windows — a transcript's own sections, a
//      document's own pages. These are the file's structure, not an arbitrary
//      chop, so a window boundary is somewhere a reader would also stop.
//   2. Score each window against the question by term overlap, Hebrew-aware.
//   3. Spend the budget on the best windows, in document order, and SAY what
//      was left unread — per file, in windows, not as a vague "truncated".
//
// THIS IS THE SEAM VECTOR RETRIEVAL DROPS INTO (founder decision D8, "seam now,
// vectors next"). Step 2 is the only part that changes: swap term overlap for
// embedding similarity and everything either side of it stays as it is. The
// windows, the budget, the honesty about what was skipped — all of that is the
// part that has to exist first, and none of it is model-specific.
//
// NOTHING HERE CALLS A MODEL. A selection step that itself costs a completion
// would hand back most of what it saves, and would make every question depend
// on two round trips instead of one.
// ─────────────────────────────────────────────────────────────────────────────

import type { SourceText } from './context'

/**
 * Characters per token, measured on this corpus rather than assumed.
 *
 * 120k characters of Hebrew came to ~58k tokens against gpt-4.1 — about 2.1
 * characters per token, roughly HALF what English gets. A budget set from an
 * English rule of thumb is twice too big here, which is exactly how a prompt
 * came back `429 — Limit 30000, Requested 61267`.
 */
const HEBREW_CHARS_PER_TOKEN = 2.1
const LATIN_CHARS_PER_TOKEN = 3.9

/**
 * Below this, a slice is not worth sending.
 *
 * A hundred tokens of a filing answers nothing and still invites the model to
 * sound certain — the same reasoning as the old MIN_USEFUL_CHARS, in the unit
 * the budget is actually counted in.
 */
const MIN_SLICE_TOKENS = 150

/** Marks a window the budget forced us to cut — named in the prompt AND counted as partial. */
const TRIMMED_SUFFIX = ' — first part only'

/** A cheap, deliberately pessimistic token estimate for mixed Hebrew/Latin text. */
export function estimateTokens(text: string): number {
  if (!text) return 0
  // THE SHARE IS MEASURED OVER LETTERS, NOT OVER EVERY CHARACTER.
  //
  // Counting spaces and punctuation as "not Hebrew" made real Hebrew prose look
  // about 40% Latin, which priced it at ~2.7 characters per token against the
  // 2.1 this module measured — so an 18,000-token budget was really nearer
  // 23,000, eating exactly the margin the number was chosen to leave under a
  // 30,000-per-minute ceiling. An estimate used as a ceiling must err high.
  const hebrew = (text.match(/[֐-׿]/g) ?? []).length
  const latin = (text.match(/[A-Za-z0-9]/g) ?? []).length
  const letters = hebrew + latin
  const share = letters === 0 ? 0 : hebrew / letters
  const perToken = share * HEBREW_CHARS_PER_TOKEN + (1 - share) * LATIN_CHARS_PER_TOKEN
  return Math.ceil(text.length / perToken)
}

export type Window = {
  /** what a reader would call this stretch — "Q&A", "p.14", "00:41" */
  label: string
  text: string
  /** position in the file, so a selection can be re-assembled in reading order */
  index: number
}

/**
 * A file cut along ITS OWN seams.
 *
 * `contentToText` already emits `## section` for a transcript and `[p.N]` for a
 * document, so those markers are the structure the file itself declares. A file
 * with no markers is cut into even windows as a fallback — still better than one
 * lump, because a lump can only be included or excluded whole.
 */
export function windowsOf(text: string, target = 1800): Window[] {
  const out: Window[] = []
  const marked = /^(##\s+.*|\[p\.\d+\])$/gm
  const hits: { index: number; label: string }[] = []
  let m: RegExpExecArray | null
  while ((m = marked.exec(text))) {
    hits.push({ index: m.index, label: m[0] })
    if (m.index === marked.lastIndex) marked.lastIndex++ // a zero-width match cannot stall the scan
  }

  if (hits.length > 0) {
    for (let i = 0; i < hits.length; i++) {
      const start = hits[i].index
      const end = i + 1 < hits.length ? hits[i + 1].index : text.length
      const label = hits[i].label.replace(/^##\s+/, '').replace(/^\[|\]$/g, '')
      const body = text.slice(start, end).trim()
      if (!body) continue
      // A section can itself be enormous — a Q&A block is often most of a call —
      // so a long one is split further and keeps its label with a part number.
      if (body.length > target * 2.5) {
        const parts = Math.ceil(body.length / target)
        const size = Math.ceil(body.length / parts)
        for (let p = 0; p < parts; p++) {
          const slice = body.slice(p * size, (p + 1) * size).trim()
          if (slice)
            out.push({
              label: parts > 1 ? `${label} (${p + 1}/${parts})` : label,
              text: slice,
              index: out.length,
            })
        }
      } else {
        out.push({ label, text: body, index: out.length })
      }
    }
    return out
  }

  for (let i = 0; i < text.length; i += target) {
    const slice = text.slice(i, i + target).trim()
    if (slice) out.push({ label: `${Math.floor(i / target) + 1}`, text: slice, index: out.length })
  }
  return out
}

/**
 * Meaningful words of a question, Hebrew and Latin.
 *
 * Hebrew has no casing and glues prefixes (ו/ה/ב/ל/מ/ש/כ) onto words, so a
 * naive split makes "ההכנסות" and "הכנסות" different terms and the overlap
 * silently misses. Stripping one leading prefix letter is crude and is the
 * right amount of clever for a scorer that vector search will replace.
 */
export function terms(q: string): string[] {
  const raw = q
    .toLowerCase()
    // Explicit ranges rather than \p{L}: this file compiles under the repo's
    // default target, where the /u property escapes are not available.
    .replace(/[^0-9a-z֐-׿\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
  const out: string[] = []
  const add = (w: string) => {
    if (out.indexOf(w) === -1) out.push(w)
  }
  for (const w of raw) {
    add(w)
    if (/^[֐-׿]/.test(w) && w.length > 3 && /^[והבלמשכ]/.test(w)) {
      add(w.slice(1))
    }
  }
  return out
}

/** How well one window answers this question. Ties break toward earlier windows. */
export function scoreWindow(qterms: string[], w: Window): number {
  if (qterms.length === 0) return 0
  const hay = w.text.toLowerCase()
  let hits = 0
  for (const t of qterms) if (hay.includes(t)) hits += 1
  return hits / qterms.length
}

export type PlannedSource = {
  itemId: string
  title: string
  kind: string
  /** how many of this file's windows were read, and how many exist */
  read: number
  total: number
}

export type Plan = {
  /** the block that goes in the prompt */
  text: string
  /** every file on the shelf, and how much of it was actually read */
  sources: PlannedSource[]
  /** titles read only in part — what the UI must say out loud */
  truncated: string[]
  /** titles not read at all */
  omitted: string[]
  tokens: number
}

/**
 * Choose what to send, and be exact about what was left out.
 *
 * EVERY FILE GETS ITS OUTLINE, even one whose text is not read: the model must
 * be able to say "there is a Q3 call on this shelf that I did not open" rather
 * than answer as though it were not there. That is the difference between a
 * short answer and a wrong one, and it costs a line per file.
 */
export function planContext(opts: {
  question: string
  sources: SourceText[]
  /** tokens available for SOURCE TEXT — the caller subtracts prompt and history first */
  budgetTokens: number
}): Plan {
  const usable = opts.sources.filter((s) => s.text.trim().length > 0)
  if (usable.length === 0) {
    return { text: '', sources: [], truncated: [], omitted: [], tokens: 0 }
  }

  const qterms = terms(opts.question)
  const cut = usable.map((s) => ({ source: s, windows: windowsOf(s.text) }))

  // The outline is not optional and is charged for first.
  const outline = cut
    .map(
      ({ source, windows }) =>
        `- ${source.title} (${source.kind}, id: ${source.itemId}) — ${windows.length} sections: ${windows
          .map((w) => w.label)
          .slice(0, 24)
          .join(' · ')}`
    )
    .join('\n')

  const scored = cut
    .flatMap(({ source, windows }) =>
      windows.map((w) => ({ source, window: w, score: scoreWindow(qterms, w) }))
    )
    .sort((a, b) => b.score - a.score || a.window.index - b.window.index)

  // FAIRNESS FIRST, THEN RELEVANCE. One window from each file before a second
  // from any: a question that names two companies must not be answered entirely
  // out of whichever one happens to use more of its words.
  const firstPass: typeof scored = []
  const rest: typeof scored = []
  const seenFile = new Set<string>()
  for (const s of scored) {
    if (!seenFile.has(s.source.itemId)) {
      seenFile.add(s.source.itemId)
      firstPass.push(s)
    } else rest.push(s)
  }

  let spent = estimateTokens(outline)
  const chosen = new Map<string, Window[]>()

  // THE FIRST PASS IS RATIONED, THE SECOND IS GREEDY.
  //
  // Without the ration, one long section could be trimmed to fill the ENTIRE
  // remaining budget and every other file would then be reported unread — the
  // fairness rule above defeated by the trimming rule below. Each file in the
  // first pass may take at most its equal share of what is left, so "one
  // window each before a second for anyone" survives contact with a big
  // section. Whatever the ration leaves unspent goes to the second pass, so
  // nothing is wasted keeping the promise.
  const passes = firstPass
    .map((s, i) => ({ s, cap: () => Math.floor((opts.budgetTokens - spent) / (firstPass.length - i)) }))
    .concat(rest.map((s) => ({ s, cap: () => opts.budgetTokens - spent })))

  for (const { s, cap } of passes) {
    const cost = estimateTokens(s.window.text)
    const room = Math.min(cap(), opts.budgetTokens - spent)
    let take = s.window
    if (cost > room) {
      // A WINDOW TOO BIG TO FIT IS TRIMMED, NOT DROPPED — but only for a file
      // that has nothing yet. Dropping it whole was the bug this rule exists
      // for: one long section could be the ONLY place a question is answered,
      // and refusing it left the file reported as unread while the budget sat
      // unspent. A trimmed slice of the right section still beats a whole
      // slice of the wrong one, which is the entire thesis of this module.
      const has = (chosen.get(s.source.itemId) ?? []).length > 0
      if (has || room < MIN_SLICE_TOKENS) continue
      const charsPerToken = s.window.text.length / Math.max(1, cost)
      const chars = Math.floor(room * charsPerToken)
      take = {
        ...s.window,
        // Named as partial IN THE PROMPT, so the model cannot mistake a slice
        // for the whole section.
        label: `${s.window.label}${TRIMMED_SUFFIX}`,
        text: s.window.text.slice(0, chars),
      }
    }
    spent += estimateTokens(take.text)
    const list = chosen.get(s.source.itemId) ?? []
    list.push(take)
    chosen.set(s.source.itemId, list)
  }

  const parts: string[] = []
  const sources: PlannedSource[] = []
  const truncated: string[] = []
  const omitted: string[] = []

  for (const { source, windows } of cut) {
    const picked = (chosen.get(source.itemId) ?? []).sort((a, b) => a.index - b.index)
    sources.push({
      itemId: source.itemId,
      title: source.title,
      kind: source.kind,
      read: picked.length,
      total: windows.length,
    })
    if (picked.length === 0) {
      omitted.push(source.title)
      continue
    }
    // TRIMMED COUNTS AS PARTIAL, even when the count of windows matches.
    //
    // A file with ONE window that had to be cut down reported "1 of 1 read" and
    // stayed out of `truncated` — so the prompt said "first part only" while the
    // analyst was told nothing at all. Comparing window counts is not the same
    // question as "did the model see this whole file".
    const trimmed = picked.some((w) => w.label.endsWith(TRIMMED_SUFFIX))
    if (picked.length < windows.length || trimmed) truncated.push(source.title)
    const skipped = windows.length - picked.length
    // The header states the read/unread split IN THE PROMPT, so the model knows
    // the shape of its own ignorance rather than assuming it saw the file.
    const head =
      `\n${FENCE} ${source.title} (${source.kind}, id: ${source.itemId})` +
      (skipped > 0 ? ` — ${picked.length} of ${windows.length} sections shown` : '') +
      ' >>>\n'
    parts.push(head + picked.map((w) => `[${w.label}]\n${defang(w.text)}`).join('\n\n'))
  }

  const text =
    `FILES ON THIS SHELF (every one, whether or not its text is below):\n${outline}\n` + parts.join('\n\n')

  return { text, sources, truncated, omitted, tokens: estimateTokens(text) }
}

const FENCE = '<<<ATLAS-SOURCE'
const defang = (text: string) => text.split(FENCE).join('<<<source')

/**
 * One budget for the WHOLE prompt, split between its parts.
 *
 * The two halves used to be capped independently — 40,000 characters of context
 * and, separately, 24 turns of up to 4,000 characters each — so a long
 * conversation could carry ~96k characters of history ON TOP of a context that
 * had been cut precisely to fit under a 30,000-token-per-minute ceiling. Each
 * half was inside its own limit and the prompt was far outside the real one.
 */
export function splitBudget(opts: {
  totalTokens: number
  /** the fixed parts: instructions, the question, the document being written */
  overheadTokens: number
  /** how much of what is left may go to conversation history */
  historyShare?: number
}): { history: number; sources: number } {
  const left = Math.max(0, opts.totalTokens - opts.overheadTokens)
  const history = Math.floor(left * (opts.historyShare ?? 0.25))
  return { history, sources: left - history }
}

/**
 * Keep the most RECENT turns that fit — a conversation is understood backwards.
 *
 * Returns the turns to send, oldest first, plus how many were dropped so the
 * caller can say so instead of letting the model appear to have forgotten.
 */
export function fitHistory<T extends { content: string }>(
  turns: T[],
  budgetTokens: number
): { kept: T[]; dropped: number } {
  const kept: T[] = []
  let spent = 0
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = estimateTokens(turns[i].content)
    if (spent + cost > budgetTokens) break
    spent += cost
    kept.unshift(turns[i])
  }
  return { kept, dropped: turns.length - kept.length }
}
