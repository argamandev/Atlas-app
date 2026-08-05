// ─────────────────────────────────────────────────────────────────────────────
// A CLIPPING, PLACED IN THE DOCUMENT.
//
// Founder, 2026-08-05: *"we can snip things from the report and actually connect
// them, the snippets, to the document."* A clip of a filing — a table, a chart,
// a signed line — is evidence, and evidence belongs in the analysis, not only in
// a question to Atlas.
//
// TWO WAYS IN, and the analyst chooses which. Left alone, no model is involved:
// an image is already the content, so it goes in as it was cut, under a caption
// that says where it came from. That is the difference from connecting a marked
// PASSAGE (lib/workspace/chat/compose), which is prose that has to be woven into
// prose.
//
// Founder, 2026-08-05: *"when you are connecting a snipping tool into the
// document, you can also dictate Atlas what to do with it — do I want to add it
// as a screenshot, do I want to extract the data from that screenshot and only
// present it as text, do I want to create my own table from it."* So an
// instruction turns the clip into a question about a picture, and what lands in
// the document is what Atlas made of it — with the source line kept either way,
// because a table read out of a filing still has to say which filing.
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

/**
 * What Atlas made OF a clipping — the transcribed numbers, the table it built —
 * carrying the same source line the image would have carried.
 *
 * The provenance is the whole point. A table typed out of a filing looks exactly
 * like a table somebody made up, and the analyst reading this document a week
 * later cannot tell which unless the page it came from is sitting under it.
 *
 * `html` is the model's, already sanitised by parseCompose — this only wraps it,
 * so it must not be handed anything unsanitised.
 */
export function clipDerivedHtml(opts: { html: string; title: string; pageLabel: string }): string | null {
  const body = opts.html.trim()
  if (!body) return null
  const title = escapeHtml(opts.title.trim())
  const page = escapeHtml(opts.pageLabel.trim())
  const cite = title ? `<bdi>${title}</bdi> · <bdi>${page}</bdi>` : `<bdi>${page}</bdi>`
  return `<div class="atlas-clip-derived">${body}<p class="atlas-clip-cite">${cite}</p></div>`
}
