// ─────────────────────────────────────────────────────────────────────────────
// EMBEDDINGS — gemini-embedding-001 @1536, MRL-truncated and re-normalized
// (ingestion standard §5, LAW; OpenAI ruled out for Hebrew by measurement,
// 2/15 vs 7/15). The SAME model+dimension+normalization the eval harness
// measured with — a different recipe here would certify nothing.
//
// THROWS with a readable message on failure. The caller (reindex) turns that
// into a VISIBLE index_status='failed', never a silent success (M3.3) — so this
// module does not swallow anything.
//
// `fetchImpl` is injected in tests; `npm test` makes no network calls.
// ─────────────────────────────────────────────────────────────────────────────

const BATCH = 100
const DIM = 1536
const URL_BATCH =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents'

export type EmbedOptions = {
  fetchImpl?: typeof fetch
  /** Injected in tests; defaults to process.env.GEMINI_API_KEY. */
  apiKey?: string
}

function normalize(v: number[]): number[] {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => Number((x / n).toFixed(6)))
}

/**
 * Embed `texts` under one taskType. gemini-embedding-001 is ASYMMETRIC: a
 * corpus chunk and the question that should find it are embedded under
 * different taskTypes, and embedding a query as a document is a measurable
 * quality loss, not a formality — which is why the taskType is a parameter of
 * this one shared path rather than a constant repeated at two call sites.
 */
async function embedWith(
  texts: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
  opts: EmbedOptions
): Promise<number[][]> {
  if (texts.length === 0) return []
  const key = opts.apiKey ?? process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY not set — cannot embed corpus chunks')
  const doFetch = opts.fetchImpl ?? fetch

  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    const res = await doFetch(URL_BATCH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: DIM,
        })),
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`gemini embed failed: HTTP ${res.status} ${body.slice(0, 200)}`)
    }
    const json = (await res.json()) as { embeddings?: Array<{ values: number[] }> }
    const embs = json.embeddings
    if (!embs || embs.length !== batch.length) {
      throw new Error(`gemini embed failed: expected ${batch.length} embeddings, got ${embs?.length ?? 0}`)
    }
    // MRL truncation to 1536 loses unit norm — re-normalize (Google's own guidance).
    out.push(...embs.map((e) => normalize(e.values)))
  }
  return out
}

/**
 * Embed corpus chunks (taskType RETRIEVAL_DOCUMENT). Returns one 1536-dim unit
 * vector per input, in order.
 */
export async function embedDocuments(texts: string[], opts: EmbedOptions = {}): Promise<number[][]> {
  return embedWith(texts, 'RETRIEVAL_DOCUMENT', opts)
}

/**
 * Embed a search query (taskType RETRIEVAL_QUERY) — the retrieval half of the
 * asymmetric pair. One vector, ready for `toVectorLiteral`.
 */
export async function embedQuery(text: string, opts: EmbedOptions = {}): Promise<number[]> {
  const [v] = await embedWith([text], 'RETRIEVAL_QUERY', opts)
  return v
}

/** pgvector literal — what supabase-js can write into a vector column. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}
