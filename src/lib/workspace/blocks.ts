// ─────────────────────────────────────────────────────────────────────────────
// THE WORKING DOCUMENT AS BLOCKS.
//
// Founder brief, via the workspace spec: the document is `workspace_doc_blocks`
// — heading · paragraph · quote, each with a position — "block-based rather than
// one contentEditable blob, because the table is already blocks and because a
// citation must survive editing: serialising a blob back into blocks cannot keep
// an anchor attached to the words it belongs to."
//
// HOW THAT IS HONOURED WITHOUT WRITING AN EDITOR FROM SCRATCH. The pane keeps
// ONE contentEditable root, and every TOP-LEVEL CHILD of it is a block carrying
// `data-block-id`. That is not the blob the spec warns about: the browser
// preserves element identity while you type inside a paragraph, so a block's id
// — and therefore its citation — stays attached to the words through editing,
// splitting and reordering. Pressing Enter creates a sibling with no id, which
// is exactly the signal "this is a new block".
//
// So the risky part is a DIFF, and a diff is a pure function, which is why it
// lives here with tests rather than inside a component.
//
// WHY `kind` IS NARROW AND `body` IS NOT. The database constrains kind to
// ('heading','text','quote') and that CHECK cannot be widened — altering it
// means DROP CONSTRAINT, which is hook-blocked on this shared production
// database. A clipped figure and a table Atlas built from one are neither
// headings nor quotes, so they are `text` whose body carries their (already
// sanitised) markup. kind stays a statement about MEANING, which is what export
// reads it for; body carries the shape.
// ─────────────────────────────────────────────────────────────────────────────

export type BlockKind = 'heading' | 'text' | 'quote'

/** A block as the database holds it. */
export type DocBlock = {
  id: string
  kind: BlockKind
  body: string
  position: number
  source_item_id: string | null
  source_label: string | null
  source_page: number | null
  source_line_id: string | null
  source_quote: string | null
}

/** A block as the DOM currently has it — no id yet if the analyst just made it. */
export type DraftBlock = {
  id: string | null
  kind: BlockKind
  body: string
  position: number
  /**
   * Where this block's words came from, for a draft that does not exist yet.
   *
   * Only ever set on a block being CREATED — a quote on its way in from
   * "Quote it". Reading the DOM never produces one, because an existing block's
   * citation lives in its row and is not patchable. Without this field the
   * citation was silently dropped between the card and the create call, and the
   * database then refused the row outright (`kind <> 'quote' or source_quote is
   * not null`) — a quote that vanished on the way to being saved.
   */
  citation?: Citation | null
}

/** What a citation is, at the moment it is made. */
export type Citation = {
  source_item_id: string
  source_label: string
  source_page?: number | null
  source_line_id?: string | null
  source_quote: string
}

export type BlockOp =
  | {
      op: 'create'
      draftIndex: number
      kind: BlockKind
      body: string
      position: number
      citation?: Citation | null
    }
  | { op: 'update'; id: string; body?: string; position?: number }
  | { op: 'delete'; id: string }

/** An empty row, for the fields a draft does not carry. */
export function blankBlock(): DocBlock {
  return {
    id: '',
    kind: 'text',
    body: '',
    position: 0,
    source_item_id: null,
    source_label: null,
    source_page: null,
    source_line_id: null,
    source_quote: null,
  }
}

/** A database row as this module's shape — the columns, and nothing else. */
export function toDocBlock(row: {
  id: string
  kind: string
  body: string
  position: number
  source_item_id?: string | null
  source_label?: string | null
  source_page?: number | null
  source_line_id?: string | null
  source_quote?: string | null
}): DocBlock {
  return {
    id: row.id,
    kind: (['heading', 'text', 'quote'] as const).includes(row.kind as BlockKind)
      ? (row.kind as BlockKind)
      : 'text',
    body: row.body ?? '',
    position: row.position ?? 0,
    source_item_id: row.source_item_id ?? null,
    source_label: row.source_label ?? null,
    source_page: row.source_page ?? null,
    source_line_id: row.source_line_id ?? null,
    source_quote: row.source_quote ?? null,
  }
}

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

/**
 * Tags that ARE a block when they sit at the top level of the editor.
 *
 * Anything else up there — a bare text node, a stray `<b>`, a pasted `<span>` —
 * is loose content that has to be wrapped before it can be a row, because
 * `domToBlocks` reads ELEMENTS and a text node is not one. That is not a
 * theoretical case: it is what the very first keystroke into an empty document
 * produces in Chrome, and while it went unwrapped the document read as zero
 * blocks and saved nothing at all.
 */
export const BLOCK_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'TABLE',
  'FIGURE',
  'PRE',
  'DIV',
  'HR',
])

/**
 * Read the live DOM as blocks.
 *
 * A block's KIND is decided by the element, with one deliberate exception: a
 * bare `<blockquote>` the analyst typed is `text`, not `quote`. `quote` means
 * CITED — the database enforces `kind <> 'quote' or source_quote is not null` —
 * so calling every indented paragraph a quote would make the editor unable to
 * save a perfectly ordinary one. Kind is set to 'quote' only where a citation
 * exists, which is why it is carried on the element as data-source-item.
 */
export function domToBlocks(root: { children: ArrayLike<Element> }): DraftBlock[] {
  return blockElements(root).map((el, i) => {
    const id = el.getAttribute('data-block-id')
    const cited = Boolean(el.getAttribute('data-source-item'))
    const tag = el.tagName.toUpperCase()
    const kind: BlockKind = cited ? 'quote' : HEADING_TAGS.has(tag) ? 'heading' : 'text'
    return { id: id || null, kind, body: (el.innerHTML ?? '').trim(), position: i }
  })
}

/**
 * The elements that ARE blocks, in order — the same filter `domToBlocks` uses.
 *
 * Exported because the caller has to write new ids back onto the elements after
 * the server creates them, and `drafts[i]` must therefore mean `elements[i]`.
 * Deriving that mapping twice, in two places, with two copies of the
 * emptiness rule, is how the two quietly stop agreeing.
 */
export function blockElements(root: { children: ArrayLike<Element> }): Element[] {
  const out: Element[] = []
  for (const el of Array.from(root.children as ArrayLike<Element>)) {
    const body = (el.innerHTML ?? '').trim()
    const text = (el.textContent ?? '').trim()
    // An empty paragraph is the caret resting between two thoughts, not
    // content. It is not saved, and it is not deleted from the screen either.
    if (!body || (!text && !/<(img|table|figure|hr)\b/i.test(body))) continue
    out.push(el)
  }
  return out
}

/**
 * What has to happen to the database for it to match the screen.
 *
 * Ordered so a caller can apply it without thinking: deletes first (they free
 * nothing but keep the list small), then updates, then creates. Positions are
 * always rewritten from the draft order, because "which paragraph is third" is
 * a fact about the document and not about when a row happened to be inserted.
 *
 * A KIND CHANGE IS A DELETE AND A CREATE, not an update. The PATCH route
 * deliberately accepts only body and position — "the citation is NOT patchable"
 * — so turning a cited quote into a paragraph must lose the citation rather than
 * keep an anchor that the new text no longer stands behind.
 */
export function diffBlocks(prev: DocBlock[], next: DraftBlock[]): BlockOp[] {
  const byId = new Map(prev.map((b) => [b.id, b]))
  const seen = new Set<string>()
  const ops: BlockOp[] = []
  const creates: BlockOp[] = []
  const updates: BlockOp[] = []

  next.forEach((d, i) => {
    const old = d.id ? byId.get(d.id) : undefined
    if (!old || old.kind !== d.kind) {
      if (old) {
        seen.add(old.id)
        ops.push({ op: 'delete', id: old.id })
      }
      creates.push({
        op: 'create',
        draftIndex: i,
        kind: d.kind,
        body: d.body,
        position: i,
        ...(d.citation ? { citation: d.citation } : {}),
      })
      return
    }
    seen.add(old.id)
    const patch: { op: 'update'; id: string; body?: string; position?: number } = {
      op: 'update',
      id: old.id,
    }
    if (old.body !== d.body) patch.body = d.body
    if (old.position !== i) patch.position = i
    if (patch.body !== undefined || patch.position !== undefined) updates.push(patch)
  })

  for (const b of prev) if (!seen.has(b.id)) ops.push({ op: 'delete', id: b.id })
  return [...ops, ...updates, ...creates]
}

/**
 * A CITATION THAT LOST ITS SOURCE IS SHOWN, NOT HIDDEN AND NOT FAKED.
 *
 * `source_item_id` is `on delete set null`, so removing a file from the shelf
 * leaves the analyst's sentence in place with the anchor released. The label and
 * the quoted words survive, and that is the whole point: "כפי שנאמר בשיחת Q3"
 * pointing at nothing is still readable evidence of what it used to point at,
 * where a link that still LOOKS live is a lie.
 *
 * `drifted` is the third state and the reason `source_quote` exists. A
 * transcript re-processed through Gemini can renumber its lines, so an anchor
 * can still RESOLVE — to different words. Comparing the snapshot against what
 * the anchor resolves to today is what lets the UI say "this moved" instead of
 * showing a confident, wrong quote.
 */
export type CitationState = 'live' | 'missing' | 'drifted' | 'none'

export function citationState(
  block: Pick<DocBlock, 'source_item_id' | 'source_label' | 'source_quote'>,
  opts: { itemExists: boolean; resolvesTo?: string | null }
): CitationState {
  if (!block.source_label && !block.source_item_id) return 'none'
  if (!block.source_item_id) return 'missing'
  if (!opts.itemExists) return 'missing'
  const now = opts.resolvesTo
  if (typeof now === 'string' && block.source_quote) {
    if (normalise(now) !== normalise(block.source_quote)) return 'drifted'
  }
  return 'live'
}

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Blocks → one HTML string, for the surfaces that still want one (the pane's
 * initial paint, and anything that reads the document as text).
 *
 * The citation is rendered as part of the block rather than bolted on, so it
 * travels with a copy-paste the way a source line printed under a quote does.
 */
export function blocksToHtml(blocks: DocBlock[]): string {
  return [...blocks]
    .sort((a, b) => a.position - b.position)
    .map((b) => {
      // A RELEASED SOURCE IS MARKED ON THE ELEMENT. `source_item_id` is
      // `on delete set null`, so a block that still has a label but has lost
      // its item is precisely "the file was removed from this workspace" — the
      // state the citation design exists to make visible rather than silently
      // absent. CSS reads this; nothing else has to know.
      const orphaned = !b.source_item_id && Boolean(b.source_label)
      const attrs =
        ` data-block-id="${escapeAttr(b.id)}"` +
        (b.source_item_id ? ` data-source-item="${escapeAttr(b.source_item_id)}"` : '') +
        (orphaned ? ' data-citation="missing"' : '')
      if (b.kind === 'heading') return `<h2${attrs}>${b.body}</h2>`
      if (b.kind === 'quote') return `<blockquote${attrs}>${b.body}</blockquote>`
      return `<p${attrs}>${b.body}</p>`
    })
    .join('')
}

/** Plain text of the document, in order — what the model reads. */
export function blocksToText(blocks: DocBlock[]): string {
  return [...blocks]
    .sort((a, b) => a.position - b.position)
    .map((b) => stripTags(b.body))
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Where a passage aimed at a heading actually goes.
 *
 * "Put this under the board section" means after the heading AND after
 * everything already under it, up to the next heading — which is what a person
 * means and not what "after the heading" literally says. With no anchor, or an
 * anchor the document does not have, it goes at the end; `parseCompose` already
 * refuses a heading that is not in the list, so this is the second guard rather
 * than the first.
 */
export function insertIndexFor(blocks: DocBlock[], afterHeading: string | null): number {
  const ordered = [...blocks].sort((a, b) => a.position - b.position)
  if (!afterHeading) return ordered.length
  const target = normalise(afterHeading)
  const start = ordered.findIndex((b) => b.kind === 'heading' && normalise(stripTags(b.body)) === target)
  if (start === -1) return ordered.length
  for (let i = start + 1; i < ordered.length; i++) {
    if (ordered[i].kind === 'heading') return i
  }
  return ordered.length
}

/** The headings Atlas is allowed to aim at, in order. */
export function blockHeadings(blocks: DocBlock[]): string[] {
  return [...blocks]
    .sort((a, b) => a.position - b.position)
    .filter((b) => b.kind === 'heading')
    .map((b) => stripTags(b.body))
    .filter(Boolean)
}

const stripTags = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * A composed fragment (already sanitised by parseCompose) split into blocks.
 *
 * Atlas answers with a fragment of several paragraphs; storing it as ONE block
 * would make the whole answer a single indivisible lump the analyst cannot
 * reorder or delete a paragraph of. Splitting is done on the top-level
 * boundaries the sanitiser already guarantees.
 */
export function fragmentToDrafts(html: string, startPosition: number): DraftBlock[] {
  const out: DraftBlock[] = []
  // Top-level element runs. The sanitiser's output is a flat list of allowed
  // block tags, so a non-greedy tag-to-matching-close scan is enough — and
  // anything that is not wrapped becomes its own paragraph rather than vanishing.
  const re = /<(h2|h3|p|ul|ol|blockquote|table)\b[^>]*>[\s\S]*?<\/\1>/gi
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const loose = html.slice(last, m.index).trim()
    if (loose) out.push(draft(loose, 'text'))
    const tag = m[1].toLowerCase()
    const kind: BlockKind = tag === 'h2' || tag === 'h3' ? 'heading' : 'text'
    const body = tag === 'h2' || tag === 'h3' ? inner(m[0]) : m[0]
    out.push(draft(body, kind))
    last = m.index + m[0].length
  }
  const tail = html.slice(last).trim()
  if (tail) out.push(draft(tail, 'text'))
  return out.map((d, i) => ({ ...d, position: startPosition + i }))
}

const draft = (body: string, kind: BlockKind): DraftBlock => ({
  id: null,
  kind,
  body,
  position: 0,
})

const inner = (el: string) => el.replace(/^<[^>]*>/, '').replace(/<\/[^>]*>$/, '')
