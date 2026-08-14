// ─────────────────────────────────────────────────────────────────────────────
// VERIFIED AT WRITE (spec §2.4 — law). A model-produced citation is checked
// against the source it claims BEFORE it is allowed onto the answer: the quoted
// text must exist in the anchor's `content` (transcript window) or the source
// page/fact it names. A citation that fails is rejected and the model is told
// to fix it — never silently kept, never silently dropped (M3.3).
//
// Match is normalised (whitespace/quote-flavour/nikud-insensitive) because the
// model paraphrases punctuation even when quoting faithfully; it is NOT
// fuzzy — a citation must still be a substring of the real text, verbatim
// otherwise.
// ─────────────────────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s
    .replace(/[֑-ׇ]/g, '') // Hebrew nikud/cantillation
    .replace(/[“”״]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export interface CitationClaim {
  /** The exact text the model claims was said/written. */
  quote: string
  /** The verbatim source content this claim is anchored to. */
  sourceContent: string
}

export type CitationVerdict = { ok: true } | { ok: false; reason: string }

/**
 * The ONE choke point every citation passes through, corpus and web alike
 * (M3.1). Returns why it failed, in words fit to hand back to the model as a
 * tool-error so it can retry against the real text rather than invent one.
 */
export function verifyCitation(claim: CitationClaim): CitationVerdict {
  const quote = claim.quote?.trim()
  if (!quote) return { ok: false, reason: 'empty quote — cite the exact source text' }
  if (normalise(claim.sourceContent).includes(normalise(quote))) return { ok: true }
  return {
    ok: false,
    reason:
      'quoted text was not found verbatim in the cited source — quote the source exactly, do not paraphrase',
  }
}
