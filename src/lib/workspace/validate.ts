import type { WsItemKind, WsBlockKind } from './data'

// ─────────────────────────────────────────────────────────────────────────────
// Request-body validation for the workspace routes. Pure, so it is unit-testable
// without booting Next. Hand-rolled rather than zod, matching
// src/lib/projects/validate.ts — see its header for why.
//
// WHICH RULES THE DATABASE ACTUALLY BACKS, named rather than asserted in bulk.
// This header used to claim that every rule below mirrors a constraint and that
// loosening one "only causes 500s, which is the safe direction". That was FALSE
// for the kind↔provenance rule, which had no constraint at all until migration
// 017 — loosening it wrote a corrupt row silently, and a row lying about its own
// kind makes the UI resolve a page anchor against a call. A cold review caught
// the comment and the hole together, which is the useful lesson: a blanket claim
// about someone else's guarantees is exactly the sentence that rots.
//
//   parseItemCreate   exactly-one-provenance  -> workspace_items_one_source (016)
//   parseItemCreate   kind matches provenance -> workspace_items_kind_matches_source (017)
//   parseBlockCreate  page XOR line           -> workspace_doc_blocks_one_anchor (016)
//   parseBlockCreate  a quote carries its text-> workspace_doc_blocks_quote_has_text (016)
//
// Those four are belt-and-braces: the constraint is the guarantee, and checking
// here turns a Postgres constraint name in a 500 into a sentence the UI can
// render. Every OTHER rule below — lengths, trimming, which fields a patch may
// touch — exists ONLY here. Loosening one of those writes a bad row silently, so
// they are not "the safe direction" and must not be relaxed on that reasoning.
// If you add a rule, either add its constraint or say plainly that it is alone.
// ─────────────────────────────────────────────────────────────────────────────

export const WS_NAME_MAX = 200
export const WS_BODY_MAX = 20_000

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

function parseName(v: unknown): Parsed<string> {
  const n = str(v)?.trim()
  if (!n) return { ok: false, error: 'name is required' }
  if (n.length > WS_NAME_MAX) return { ok: false, error: `name exceeds ${WS_NAME_MAX} characters` }
  return { ok: true, value: n }
}

// ── Workspaces ───────────────────────────────────────────────────────────────

export function parseWorkspaceCreate(body: unknown): Parsed<{ name: string }> {
  const n = parseName((body as { name?: unknown } | null)?.name)
  return n.ok ? { ok: true, value: { name: n.value } } : n
}

export type WorkspacePatch = Partial<{ name: string; doc_title: string }>

/**
 * Only the two editable fields are accepted. `user_id` is not among them — a
 * client must never be able to reassign ownership — and an unrecognised body is
 * refused rather than silently applying nothing and reporting success.
 */
export function parseWorkspacePatch(body: unknown): Parsed<WorkspacePatch> {
  const b = (body ?? {}) as Record<string, unknown>
  const out: WorkspacePatch = {}

  if (b.name !== undefined) {
    const n = parseName(b.name)
    if (!n.ok) return n
    out.name = n.value
  }
  if (b.doc_title !== undefined) {
    const t = str(b.doc_title)
    if (t === null) return { ok: false, error: 'doc_title must be a string' }
    if (t.length > WS_NAME_MAX) {
      return { ok: false, error: `doc_title exceeds ${WS_NAME_MAX} characters` }
    }
    // Unlike `name`, an empty title is legitimate — clearing it is a real edit.
    out.doc_title = t
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'no editable field supplied' }
  return { ok: true, value: out }
}

// ── Shelf items ──────────────────────────────────────────────────────────────

export type ItemCreate = {
  kind: WsItemKind
  name: string
  transcript_id?: string
  document_id?: string
  storage_path?: string
}

type ProvenanceField = 'transcript_id' | 'document_id' | 'storage_path'

const KIND_FIELD: Record<WsItemKind, ProvenanceField> = {
  transcript: 'transcript_id',
  document: 'document_id',
  file: 'storage_path',
}

const PROVENANCE_FIELDS: ProvenanceField[] = ['transcript_id', 'document_id', 'storage_path']

export function parseItemCreate(body: unknown): Parsed<ItemCreate> {
  const b = (body ?? {}) as Record<string, unknown>

  const kind = str(b.kind) as WsItemKind | null
  if (!kind || !(kind in KIND_FIELD)) {
    return { ok: false, error: 'kind must be transcript, document or file' }
  }
  const n = parseName(b.name)
  if (!n.ok) return n

  const supplied = PROVENANCE_FIELDS.filter((f) => str(b[f])?.trim())
  if (supplied.length !== 1) {
    return {
      ok: false,
      error: 'an item needs exactly one of transcript_id, document_id, storage_path',
    }
  }
  const field = supplied[0]
  // A row claiming one kind while holding another's id would render the wrong
  // icon AND resolve its citations against the wrong source — a page anchor
  // against a call, or a line id against a PDF.
  if (field !== KIND_FIELD[kind]) {
    return { ok: false, error: `kind "${kind}" does not match ${field}` }
  }

  const value: ItemCreate = { kind, name: n.value }
  const raw = str(b[field])!.trim()
  if (field === 'transcript_id') value.transcript_id = raw
  else if (field === 'document_id') value.document_id = raw
  else value.storage_path = raw
  return { ok: true, value }
}

export type ItemPatch = Partial<{ is_open: boolean; position: number }>

/**
 * LAYOUT ONLY. An item's provenance and name are set once, at attach; letting a
 * patch move them would let a shelf entry quietly become a different source
 * while the blocks citing it kept their anchors.
 */
export function parseItemPatch(body: unknown): Parsed<ItemPatch> {
  const b = (body ?? {}) as Record<string, unknown>
  const out: ItemPatch = {}

  // `!== undefined`, not truthiness: `is_open: false` IS the close action, and
  // a truthiness check would drop it and answer "saved" having changed nothing.
  if (b.is_open !== undefined) {
    if (typeof b.is_open !== 'boolean') return { ok: false, error: 'is_open must be a boolean' }
    out.is_open = b.is_open
  }
  if (b.position !== undefined) {
    if (!isIndex(b.position)) return { ok: false, error: 'position must be a non-negative integer' }
    out.position = b.position
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'no editable field supplied' }
  return { ok: true, value: out }
}

// ── Working-document blocks ──────────────────────────────────────────────────

export type BlockCreate = {
  kind: WsBlockKind
  body: string
  position: number
  source_item_id?: string
  source_label?: string
  source_page?: number
  source_line_id?: string
  source_quote?: string
}

const BLOCK_KINDS: WsBlockKind[] = ['heading', 'text', 'quote']

export function parseBlockCreate(body: unknown): Parsed<BlockCreate> {
  const b = (body ?? {}) as Record<string, unknown>

  const kind = str(b.kind) as WsBlockKind | null
  if (!kind || !BLOCK_KINDS.includes(kind)) {
    return { ok: false, error: 'kind must be heading, text or quote' }
  }
  const text = str(b.body) ?? ''
  if (text.length > WS_BODY_MAX) return { ok: false, error: `body exceeds ${WS_BODY_MAX} characters` }

  const position = b.position === undefined ? 0 : b.position
  if (!isIndex(position)) return { ok: false, error: 'position must be a non-negative integer' }

  const quote = str(b.source_quote)?.trim()
  // Mirrors the DB CHECK. Without the snapshot there is nothing to detect drift
  // against, so a re-processed transcript would let this citation resolve to the
  // wrong words while still rendering as a working link.
  if (kind === 'quote' && !quote) {
    return { ok: false, error: 'a quote block must carry the quoted text' }
  }

  // `!= null` rather than truthiness: page 0 is a legitimate anchor, and
  // dropping it would store a citation pointing at nothing in particular.
  const hasPage = b.source_page != null
  const line = str(b.source_line_id)?.trim()
  if (hasPage && line) {
    return { ok: false, error: 'a block anchors to a page or a line, not both' }
  }
  if (hasPage && !isIndex(b.source_page)) {
    return { ok: false, error: 'source_page must be a non-negative integer' }
  }

  const value: BlockCreate = { kind, body: text, position }
  const item = str(b.source_item_id)?.trim()
  if (item) value.source_item_id = item
  const label = str(b.source_label)?.trim()
  if (label) value.source_label = label
  if (hasPage) value.source_page = b.source_page as number
  if (line) value.source_line_id = line
  if (quote) value.source_quote = quote
  return { ok: true, value }
}

export type BlockPatch = Partial<{ body: string; position: number }>

/**
 * The citation is NOT patchable. A block's anchor and its quoted snapshot are
 * written together at creation; letting the body move independently of them
 * would let a sentence drift away from the quote it claims to be citing.
 * Re-citing means a new block.
 */
export function parseBlockPatch(body: unknown): Parsed<BlockPatch> {
  const b = (body ?? {}) as Record<string, unknown>
  const out: BlockPatch = {}

  if (b.body !== undefined) {
    const v = str(b.body)
    if (v === null) return { ok: false, error: 'body must be a string' }
    if (v.length > WS_BODY_MAX) return { ok: false, error: `body exceeds ${WS_BODY_MAX} characters` }
    // An empty body is legitimate — clearing a block is a real edit.
    out.body = v
  }
  if (b.position !== undefined) {
    if (!isIndex(b.position)) return { ok: false, error: 'position must be a non-negative integer' }
    out.position = b.position
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'no editable field supplied' }
  return { ok: true, value: out }
}
