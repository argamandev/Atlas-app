// Pinge chat attachments (spec 2026-07-17): validation of the wire shape + the
// provider-specific message parts. PURE on purpose (no server-only imports) so the
// whole attachment contract is unit-tested; /api/chat does the DB lookups.

export interface ChatAttachment {
  dataUrl: string
  page: number
  documentId: string
}

export const ATTACHMENT_MAX = 4
/** Per-image base64 cap (~1.5MB decoded) — the client downscales long side to 1600px anyway. */
export const ATTACHMENT_MAX_B64 = 2_000_000
const PNG_PREFIX = 'data:image/png;base64,'

/** Untrusted request body → clean attachment list (silently drops invalid/excess entries). */
export function parseAttachments(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) return []
  const out: ChatAttachment[] = []
  for (const item of raw as Array<Record<string, unknown> | null>) {
    if (out.length >= ATTACHMENT_MAX) break
    const dataUrl = item?.dataUrl
    const page = item?.page
    const documentId = item?.documentId
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PNG_PREFIX)) continue
    if (dataUrl.length - PNG_PREFIX.length > ATTACHMENT_MAX_B64) continue
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) continue
    if (typeof documentId !== 'string' || !documentId) continue
    out.push({ dataUrl, page, documentId })
  }
  return out
}

/** Hebrew caption placed beside each image so answers can cite the page naturally. */
export function snipCaption(meta: { title: string } | null, page: number): string {
  return meta ? `תצלום מעמוד ${page} של ${meta.title}` : `תצלום מעמוד ${page} מהדוח`
}

/** Gemini REST parts: inline_data image + caption text, in order, before the user text. */
export function geminiSnipParts(atts: ChatAttachment[], captions: string[]): Array<Record<string, unknown>> {
  return atts.flatMap((a, i) => [
    { inline_data: { mime_type: 'image/png', data: a.dataUrl.slice(PNG_PREFIX.length) } },
    { text: captions[i] ?? '' },
  ])
}

/** OpenAI chat content parts for the fallback: caption text then image_url data URL. */
export function openAiSnipContent(
  atts: ChatAttachment[],
  captions: string[]
): Array<Record<string, unknown>> {
  return atts.flatMap((a, i) => [
    { type: 'text', text: captions[i] ?? '' },
    { type: 'image_url', image_url: { url: a.dataUrl } },
  ])
}
