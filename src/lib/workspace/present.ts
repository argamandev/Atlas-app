import type { Dictionary } from '@/lib/i18n/dictionaries/en'
import { relativeLabel, type Locale } from '@/lib/time/relative'
import type { CitationState, Workspace, WorkspaceItemRow, WorkspaceRow, WsFile } from './data'

// ─────────────────────────────────────────────────────────────────────────────
// Row -> display shape. PURE, DOM-free, no I/O, so every label rule is testable
// under node:test (this repo has no DOM test infrastructure).
//
// This is the seam where facts become labels, and nothing upstream of it is
// allowed to store one. The stub this replaces kept `updatedLabel: '2h ago'`,
// `initial: 'ת'` and `subtitle` as DATA; all three are computed here.
// ─────────────────────────────────────────────────────────────────────────────

/** Collapse whitespace so a reflowed line is not mistaken for a moved one. */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Is a citation still telling the truth?
 *
 * `resolved` is the text the anchor points at TODAY, or null when the anchor no
 * longer resolves at all.
 *
 * The comparison exists because `transcripts.formatted_data` is REGENERATED
 * when a call is re-processed through Gemini: the line ids survive while their
 * sentences change, so a citation can resolve perfectly to the wrong words.
 * Rendering that as a normal link is the exact "plausible-looking, not absent"
 * failure .claude/rules/app.md keeps filing — hence three states, not two.
 *
 * A block with no quote snapshot cannot be judged, so it stays live while it
 * resolves. Only `quote` blocks are required to carry one, and the database
 * enforces that (workspace_doc_blocks_quote_has_text).
 */
export function citationState(
  block: { source_item_id: string | null; source_quote: string | null },
  resolved: string | null
): CitationState {
  if (!block.source_item_id) return 'absent'
  if (resolved === null) return 'absent'
  if (!block.source_quote) return 'live'
  return norm(resolved).includes(norm(block.source_quote)) ? 'live' : 'drifted'
}

/**
 * The avatar tile glyph.
 *
 * Spread rather than `name[0]`: an emoji is a surrogate pair, and indexing
 * splits it into half a character that renders as a replacement glyph. The
 * stub's own demo data used '⚓', so this was reachable on day one.
 */
export function workspaceInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '+'
  // codePointAt/fromCodePoint rather than [0] or a spread: this file compiles
  // below the ES2015 iteration target, and indexing would return half a
  // surrogate pair anyway.
  return String.fromCodePoint(trimmed.codePointAt(0)!)
}

/**
 * One company names itself; several are counted; none is not invented.
 *
 * DERIVED, never stored — a workspace can be about one issuer or about a whole
 * sector, and a `company_id` column could not represent the second without
 * picking one of them and lying about the rest.
 */
export function deriveCompany(companyNames: string[], dict: Dictionary): string {
  // filter/indexOf rather than a Set spread, same ES2015 iteration reason as
  // workspaceInitial above. A source with no company must not count as one.
  const unique = companyNames.filter((n, i) => n && companyNames.indexOf(n) === i)
  if (unique.length === 0) return dict.workspace.companyNone
  if (unique.length === 1) return unique[0]
  return dict.workspace.companyMany.replace('{n}', String(unique.length))
}

/** The second half of the picker subtitle. Inflects at one in both locales. */
export function deriveSub(count: number, dict: Dictionary): string {
  if (count === 1) return dict.workspace.sourceOne
  return dict.workspace.sourceMany.replace('{n}', String(count))
}

/**
 * What to CALL the working document.
 *
 * `doc_title` is `text not null default ''`, so an unnamed document is the
 * normal state of a new workspace rather than an edge case. It showed as a blank
 * line in the panel and — once the document could join multi-view — as a tab chip
 * containing nothing but a close button. A thing you can open needs a name.
 *
 * Separate from the stored value on purpose: this is the label, `docTitle` is the
 * fact, and the editor must bind to the fact.
 */
export function documentTitle(raw: string, dict: Dictionary): string {
  return raw.trim() || dict.workspace.untitledDocument
}

/**
 * The sentences a delete confirmation says before it destroys anything.
 *
 * `.claude/rules/db.md` and countWorkspaceContents's own header make this an
 * obligation rather than a courtesy, so the wording lives here — pure and
 * tested — instead of inside a dialog where nothing can check it.
 *
 * A ZERO IS NOT LISTED. "0 saved conversations" is noise that pushes the two
 * numbers that matter down the box, and a workspace with nothing in it should
 * say that in one line rather than three. Every count is rendered with its own
 * singular form: "1 sources on the shelf" is the kind of small wrongness that
 * makes a reader trust the rest of the dialog less, and this one is asking for
 * permission to destroy something.
 */
export function deleteWorkspaceLines(
  counts: { items: number; threads: number; blocks: number },
  dict: Dictionary
): string[] {
  const ws = dict.workspace
  const line = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('{n}', String(n)))

  const parts: string[] = []
  if (counts.items > 0) parts.push(line(counts.items, ws.deleteCountFileOne, ws.deleteCountFiles))
  if (counts.blocks > 0) parts.push(line(counts.blocks, ws.deleteCountBlockOne, ws.deleteCountBlocks))
  if (counts.threads > 0) parts.push(line(counts.threads, ws.deleteCountThreadOne, ws.deleteCountThreads))

  // The irreversibility line is last and always present — it is the one sentence
  // that is true whether or not anything is inside.
  return parts.length > 0
    ? [...parts, ws.deleteWorkspaceIrreversible]
    : [ws.deleteNothingInside, ws.deleteWorkspaceIrreversible]
}

/**
 * The sentences shown before a source comes off the shelf.
 *
 * Two facts, and the second only when it applies: the file survives in Atlas
 * (removing it from one workspace is not a deletion, and a dialog that does not
 * say so invites the user to assume the worst), and how many citations in the
 * working document are about to lose their anchor. That second number is why
 * this cannot be a bare "are you sure" — `deleteItem`'s key releases the source
 * and LEAVES the sentences, which is good behaviour nobody would guess.
 */
export function removeItemLines(citationCount: number, dict: Dictionary): string[] {
  const ws = dict.workspace
  if (citationCount <= 0) return [ws.removeFileBody]
  return [
    ws.removeFileBody,
    citationCount === 1
      ? ws.removeFileCitationOne
      : ws.removeFileCitations.replace('{n}', String(citationCount)),
  ]
}

export function presentWorkspace(
  row: WorkspaceRow,
  items: WorkspaceItemRow[],
  companyNames: string[],
  now: Date,
  locale: Locale,
  dict: Dictionary
): Workspace {
  const company = deriveCompany(companyNames, dict)
  const sub = deriveSub(items.length, dict)

  return {
    id: row.id,
    name: row.name,
    company,
    sub,
    subtitle: `${company} · ${sub}`,
    fileCount: items.length,
    updatedLabel: relativeLabel(row.updated_at, now, locale),
    initial: workspaceInitial(row.name),
    files: items.map((i): WsFile => ({
      id: i.id,
      name: i.name,
      kind: i.kind,
      // undefined, not null, for a document or an uploaded file — the field is
      // "which call is this", and only a transcript item is one.
      ...(i.transcript_id ? { transcriptId: i.transcript_id } : {}),
      // The persisted "how I left it" flag reaching the UI, which initialises
      // its open tabs from exactly this rather than defaulting to the first
      // source every time.
      live: i.is_open,
    })),
    // Agent execution is out of scope this chapter, so a real workspace has
    // none. EMPTY, never the demo agent constants — feeding those into a row
    // that came out of the database would put invented findings on a real page.
    agents: [],
    actions: [],
    // THE STORED STRING, verbatim — see documentTitle() for the display name.
    // It stopped being substituted here on 2026-08-04, when the title became
    // editable: an editor has to show what is actually saved, or clicking into
    // a field labelled "Untitled document" would make that placeholder the
    // user's real title the moment they typed one character after it.
    docTitle: row.doc_title,
  }
}
