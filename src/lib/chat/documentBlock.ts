// Pure REPORT-CONTEXT block composer (multiview M1). Kept free of server-only imports so
// node:test can exercise it; context.ts re-exports it for server callers.
const MAX_DOC_CONTEXT_CHARS = 25_000

export function buildDocumentBlock(
  meta: { title: string; quarter: string } | null,
  pages: { pageNo: number; text: string }[]
): string {
  if (!meta || pages.length === 0) return ''
  // Budget is split per-page (not applied to the joined string) so that with several marked
  // pages, later pages still survive in order instead of being sliced away entirely by an
  // earlier page's text alone exceeding the cap.
  const perPageBudget = Math.floor(MAX_DOC_CONTEXT_CHARS / pages.length)
  const body = pages.map((p) => `[page ${p.pageNo}]\n${p.text.slice(0, perPageBudget)}`).join('\n\n')
  return `=== REPORT CONTEXT (${meta.title} — ${meta.quarter}) ===\n${body}`.slice(
    0,
    MAX_DOC_CONTEXT_CHARS + 200
  )
}
