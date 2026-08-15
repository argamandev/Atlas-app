// ─────────────────────────────────────────────────────────────────────────────
// MARKED-REPORT-PAGE INJECTION (spec §2.3, ticket 08c-3).
//
// Multiview puts a report PDF beside the call. A user can mark a passage in it,
// or cut a region of a page out with the scissors, and ask about it. Two things
// then ride the turn, and they are NOT the same kind of thing:
//
//   * THE PAGE TEXT — the stored extraction of the pages in play. That is what
//     this module fences and budgets, exactly like a call.
//   * THE SNIPPED IMAGES — PNG data URLs the client captured. They travel as
//     IMAGE CONTENT BLOCKS (`loop.ts`), which is the capability 08c-3 exists to
//     add, and each gets one of this module's captions beside it so an answer can
//     name the page it read a number off.
//
// WHY THE PAGE TEXT IS A MODIFIER AND NOT A SOURCE THAT CAN END THE TURN, which
// is the one place this deliberately differs from `callInjection.ts`. When a call
// cannot be loaded the loop yields `error` and stops, because the surface is
// showing a chip promising that call and there is nothing else. Here the passage
// the surface promises is ALREADY IN THE MESSAGE — the panel composes
// `Regarding this passage from the company's quarterly report (page 4): "…"`
// verbatim into the user's text before it ever reaches the wire — and a snip, if
// there is one, arrived WITH the request and cannot fail to load. What the page
// text adds is the prose AROUND the marked passage. Losing it degrades the
// answer; it does not falsify anything on screen. So it is reported (`state`),
// never fatal — the `projectContext` shape, not the `grounding` one.
//
// AND IT COMPOSES WITH EVERY GROUNDING, which is why it is a field beside the
// `Grounding` union rather than a fifth recipe — the same correction ticket
// 08c-1 made for `projectId`. Multiview is a call (or a live call) AND a report
// at the same time; making the document a recipe would have made that ordinary
// pair unrepresentable and forced the panel to choose which half of its own
// screen to honour.
// ─────────────────────────────────────────────────────────────────────────────

import { defang, fenceSource } from './fence'
// Wire vocabulary, declared once for both sides (`protocol.ts`). Imported rather
// than re-declared so the state this decides and the state the parser admits
// cannot drift — the defect that module exists to have deleted.
import type { DocumentContextState } from './protocol'

/**
 * The chars of extracted page text one turn may carry.
 *
 * Deliberately smaller than a call's 60,000: a report page block SHARES the turn
 * with whatever the turn is grounded in (a whole call, or a live caption stream
 * at the same budget), so the two ceilings add. 25,000 is the number the old
 * `/api/chat` carried for the same block (`chat/documentBlock.ts`) — kept rather
 * than re-derived, so retiring that route does not silently change how much of a
 * report an answer is built on.
 *
 * Held as its own constant, never imported from `callInjection.ts`: the budgets
 * answer different questions and one moving must not move the other.
 */
export const DOCUMENT_BUDGET_CHARS = 25_000

/**
 * What the SYSTEM PROMPT is told when a report page rides the turn.
 *
 * A CONSTANT, never interpolated — the same property that lets the id gates in
 * `requestScope.ts` be shape gates rather than injection gates. Nothing from the
 * request body reaches the system prompt through this module.
 *
 * It states the AUTHORITY ORDER explicitly, because the two document channels
 * disagree in a predictable way: the extracted text of a financial table is
 * frequently mangled by extraction (columns interleaved, minus signs lost) while
 * the snipped IMAGE of that same table is exactly what the user is looking at.
 * The old route said this too; it is not new behaviour, it is the same sentence
 * arriving through the module that now owns it.
 */
export const DOCUMENT_SCOPE_SUMMARY =
  'A passage from the company’s report rides this turn. When a snipped IMAGE is attached, read the ' +
  'numbers from the image — it is what the user is looking at and it is the authoritative source; ' +
  'the fenced page text is the surrounding context. Name the page number when you cite either, and ' +
  'relate the report to the call when both are present.'

/**
 * What the model is told when the earlier pages did not fit.
 *
 * Said rather than merely flagged, for the reason `LIVE_TRUNCATION_NOTICE`
 * exists: a model that has silently been handed two thirds of a page will
 * present its answer as though it read the page.
 */
export const DOCUMENT_TRUNCATION_NOTICE =
  '[This report passage was longer than one turn can carry — the pages below are CUT. Say so if the ' +
  'answer depends on the part you cannot see.]'

/**
 * The sentence for pages that exist but hold no extracted text.
 *
 * A REAL STATE, not an error and not an empty block: `document_pages` rows are
 * written by an extractor that gets nothing out of a scanned or image-only PDF.
 * The model has to be able to tell "there is no document here" from "this page
 * has no readable text", or it answers from its own knowledge underneath a
 * reference block quoting a passage.
 *
 * IT TELLS THE MODEL NOT TO QUOTE IT, and that clause was bought at verification
 * rather than reasoned in. Driving this state on real data, the model repeated
 * this English sentence verbatim inside an otherwise-Hebrew answer, and the
 * resulting mixed run rendered with its quote mark and full stop on the wrong
 * side — the shape `app.md`'s bidi law is about, arriving through the one door
 * that law cannot reach. Answer text is model prose inside `Markdown`; no code
 * we write wraps its runs in `<bdi>` without a bidi segmenter, so the only lever
 * here is not to hand the model an English sentence it is tempted to quote.
 * That is a mitigation, not a mechanism, and it is named as one.
 */
export const NO_PAGE_TEXT =
  '(no text could be extracted from the marked pages of this report) ' +
  'Say IN THE USER’S OWN LANGUAGE that you cannot read the report text, rather than answering ' +
  'from anything else. Do not quote or repeat this note — it is an instruction to you, not ' +
  'material to show the user. If an image of the page is attached, read that instead.'

export interface DocumentMeta {
  title: string
  quarter: string
}

export interface DocumentPage {
  pageNo: number
  text: string
}

export interface DocumentBlock {
  /** The fenced block, ready to ride this turn's user message. */
  text: string
  /**
   * WHICH pages were cut, in order — not merely that one was.
   *
   * A BARE `truncated` BOOLEAN used to sit beside this field and was a WARNING
   * at round 3; it is gone now, removed at round 4 once nothing read it. A block
   * holds the marked pages AND every snipped page, so `truncated` went true when a page loaded
   * only because it was SNIPPED ran long, and the surface then told the user
   * their marked passage "was too long to read in full" about a passage that was
   * short. A state naming one channel cannot be decided by a flag that answers
   * for both.
   */
  truncatedPages: number[]
  /**
   * The page numbers actually CARRIED, in order.
   *
   * READ BY THE LOOP, and it has to be: a page the user marked can be missing
   * from this list while others survive — a scanned page inside a text PDF, or a
   * page with no `document_pages` row at all — and the difference between this
   * and the requested list is the only place that partial loss is visible.
   */
  pages: number[]
}

/**
 * Build the injectable block for the marked pages of one report.
 *
 * PURE, and takes the budget as an argument, so the truncation branch can be
 * driven directly instead of by manufacturing 25,000 characters.
 *
 * THE BUDGET IS SPLIT PER PAGE, not applied to the joined string, and that is
 * carried over from `chat/documentBlock.ts` rather than reinvented: applied to
 * the join, one long page sliced every later page away entirely, so the model
 * answered about page 5 having been shown only page 4 — with nothing on screen
 * saying which pages it had actually read.
 */
export function buildDocumentBlock(
  meta: DocumentMeta | null,
  pages: DocumentPage[],
  budgetChars: number = DOCUMENT_BUDGET_CHARS
): DocumentBlock {
  const withText = pages.filter((p) => (p.text ?? '').trim().length > 0)
  const label = meta ? [meta.title, meta.quarter].filter(Boolean).join(' — ') : 'company report'

  if (withText.length === 0) {
    return {
      text: fenceSource({ kind: 'filing', label, content: NO_PAGE_TEXT }),
      truncatedPages: [],
      // EMPTY, not the requested list. `pages` means "what the model was actually
      // GIVEN" — that is the whole reason the loop can compare it against what the
      // user marked — and returning the requested pages made the field describe
      // the REQUEST, which is the one thing the caller already knows.
      pages: [],
    }
  }

  // THE BUDGET IS GENUINELY SHARED across every loaded page, snipped ones
  // included, and that is not the leak round 3 named. A turn has one context
  // window; a page loaded because it was snipped occupies it exactly as a marked
  // page does. What must not be shared is the REPORTING — which page got cut is
  // recorded per page below, so a state naming the marked passage is never
  // decided by a snipped page's length.
  const perPage = Math.max(1, Math.floor(budgetChars / withText.length))
  const truncatedPages: number[] = []
  const body = withText
    .map((p) => {
      const text = p.text.trim()
      if (text.length > perPage) truncatedPages.push(p.pageNo)
      return `[page ${p.pageNo}]\n${text.slice(0, perPage)}`
    })
    .join('\n\n')

  // The notice goes FIRST, so it survives even the pathological case where the
  // block is read from the top and the cut pages follow.
  const content = truncatedPages.length > 0 ? `${DOCUMENT_TRUNCATION_NOTICE}\n\n${body}` : body

  return {
    text: fenceSource({ kind: 'filing', label, content }),
    truncatedPages,
    pages: withText.map((p) => p.pageNo),
  }
}

/**
 * WHICH STATE THE SURFACE IS TOLD — as a PURE FUNCTION of the facts, decided in
 * ONE place (M3.1).
 *
 * IT IS A FUNCTION BECAUSE THREE REVIEW ROUNDS SAY IT HAD TO BE. This decision
 * lived inline in `loop.ts` and was wrong four times, each time by measuring
 * something ADJACENT to the question — "did the read succeed", "did any page
 * survive", "was everything we FETCHED present", "was any loaded page cut" — and
 * each fix introduced the next round's defect because a condition in a branch
 * can only be checked by the cases someone thought to write. Two of the four
 * lived in the sibling branch of the same `if`, which is exactly what a choke
 * point removes. It is now swept exhaustively (`documentInjection.test.ts`).
 *
 * THE QUESTION IT ANSWERS, stated once so no future condition can drift from it:
 * *did the report TEXT the screen promised reach the model whole?* Not "did
 * anything reach the model" — the snipped IMAGES are a second channel with their
 * own guarantee (they arrive with the request and cannot fail), and folding them
 * in is what made a working turn report a failure.
 */
export function documentContextState(facts: {
  /** The pages the user MARKED — what the reference block promises as text. */
  markedPages: number[]
  /** The pages whose text actually reached the model. */
  carriedPages: number[]
  /** The pages that were CUT to fit. */
  truncatedPages: number[]
  /** The load threw, or returned nothing at all. */
  loadFailed: boolean
}): DocumentContextState {
  // NOTHING PROMISED, SO NOTHING LOST. A snip-only turn renders thumbnails and no
  // reference block: the user asked about an image, the image arrived, and there
  // is no report text for a notice to be about. This branch is FIRST, and it is
  // first because round 3's BLOCKER was a snip-only turn falling into the load
  // failure below and announcing that report text nobody asked for was missing.
  if (facts.markedPages.length === 0) return 'ok'
  if (facts.loadFailed) return 'failed'

  const carried = new Set(facts.carriedPages)
  const missing = facts.markedPages.filter((p) => !carried.has(p))
  if (missing.length === facts.markedPages.length) return 'failed'

  // Only a MARKED page being cut is this state's business. A snipped page loaded
  // alongside can be cut without the marked passage having been — round 3's
  // second finding, which told the user their short passage was too long.
  const markedCut = facts.truncatedPages.some((p) => facts.markedPages.includes(p))
  return missing.length > 0 || markedCut ? 'truncated' : 'ok'
}

/**
 * The Hebrew caption placed beside each snipped image so an answer can cite the
 * page naturally.
 *
 * DEFANGED, and that is not paranoia carried over by habit: unlike everything
 * else in this module the caption does NOT sit inside a fence — it is ordinary
 * text in the user turn, right next to an image block — so a document title
 * carrying our close delimiter would end a fence it never opened and let the
 * rest of the turn read as instructions. `fenceSource` would have defanged it;
 * nothing else on this path does.
 */
export function snipCaption(meta: DocumentMeta | null, page: number): string {
  return meta ? `תצלום מעמוד ${page} של ${defang(meta.title)}` : `תצלום מעמוד ${page} מהדוח`
}
