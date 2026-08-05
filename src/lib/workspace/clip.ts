// ─────────────────────────────────────────────────────────────────────────────
// A CLIPPING, PLACED IN THE DOCUMENT.
//
// Founder, 2026-08-05: *"we can snip things from the report and actually connect
// them, the snippets, to the document."* A clip of a filing — a table, a chart,
// a signed line — is evidence, and evidence belongs in the analysis, not only in
// a question to Atlas.
//
// NO MODEL IS INVOLVED, and that is the difference from connecting a marked
// PASSAGE (lib/workspace/chat/compose): a passage is prose that has to be woven
// into prose, so Atlas writes around it. An image is already the content. It
// goes in as it was cut, under a caption that says where it came from, and
// nothing rewrites it.
//
// Pure so the escaping is tested: the caption carries a filing's title, which is
// user-facing text from the corpus, and it is being interpolated into HTML that
// lands in a contentEditable.
// ─────────────────────────────────────────────────────────────────────────────

const PNG_PREFIX = 'data:image/png;base64,'

/** HTML-escape a text run, attribute-safe (quotes included). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * `<figure>` for one clipping, or **null** if the source is not our own PNG
 * capture. The null is not paranoia about the current caller — the snip comes
 * from a canvas we drew — it is the boundary: this function writes a `src`
 * straight into the analyst's document, and the day something else calls it, a
 * `javascript:` or a remote URL must not be what lands there.
 *
 * Each run of the caption is its own `<bdi>`. A Hebrew filing title next to a
 * Latin "page 12" is the exact line that .claude/rules/app.md has now filed five
 * times: `dir="auto"` resolves from the FIRST strong character, so one run
 * decides the direction of the whole line and throws the other one's separator
 * to the wrong end.
 */
export function clipFigureHtml(opts: {
  dataUrl: string
  /** the source's name, e.g. "דוח דירקטוריון Q1 2026" */
  title: string
  /** already-localised page run, e.g. "page 12" / "עמוד 12" */
  pageLabel: string
}): string | null {
  if (typeof opts.dataUrl !== 'string' || !opts.dataUrl.startsWith(PNG_PREFIX)) return null
  const title = escapeHtml(opts.title.trim())
  const page = escapeHtml(opts.pageLabel.trim())
  const alt = escapeHtml(`${opts.title.trim()} · ${opts.pageLabel.trim()}`)
  const caption = title ? `<bdi>${title}</bdi> · <bdi>${page}</bdi>` : `<bdi>${page}</bdi>`
  return (
    `<figure class="atlas-clip">` +
    `<img src="${opts.dataUrl}" alt="${alt}" />` +
    `<figcaption>${caption}</figcaption>` +
    `</figure>`
  )
}
