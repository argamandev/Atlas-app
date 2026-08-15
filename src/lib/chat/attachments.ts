import { fencePart, fenceSafeLine, type FenceSafe } from '@/lib/workspace/chat/context'

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
/**
 * The only data-URL prefix a snip may carry.
 *
 * EXPORTED because `chat2/requestScope.ts` gates the same bytes for `/api/chat/v2`
 * and a second copy of this literal is a second thing to get wrong — one of them
 * accepting `image/jpeg` while the other refuses it is a difference no test would
 * be looking for. One declaration, two gates.
 */
export const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'
const PNG_PREFIX = PNG_DATA_URL_PREFIX

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

/**
 * Client-side pre-check mirroring parseAttachments' size cap: a snip past the cap would be
 * silently stripped server-side while still rendering as a chip — warn instead of sending.
 */
export function attachmentOversized(dataUrl: string): boolean {
  const payload = dataUrl.startsWith(PNG_PREFIX) ? dataUrl.length - PNG_PREFIX.length : dataUrl.length
  return payload > ATTACHMENT_MAX_B64
}

/**
 * Hebrew caption placed beside each image so answers can cite the page naturally.
 *
 * THE TITLE IS UNTRUSTED AND THIS IS A SECOND ROUTE INTO THE PROMPT. It comes
 * from `workspace_items.name`, and the caption is handed to the model as a text
 * part beside the image — so the defang applied to the prompt BUILDERS never
 * reached it, and a title could print the marker that separates quoted material
 * from instructions. `fencePart` is the same one door those builders use: it
 * defangs the marker, neutralises `>>>`, and keeps a caption to one line.
 */
export function snipCaption(meta: { title: string } | null, page: number): FenceSafe {
  return meta
    ? fenceSafeLine`תצלום מעמוד ${page} של ${fencePart(meta.title)}`
    : fenceSafeLine`תצלום מעמוד ${page} מהדוח`
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
