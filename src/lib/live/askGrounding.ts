import type { Grounding } from '@/lib/chat2/requestScope'

// ─────────────────────────────────────────────────────────────────────────────
// WHAT ASK ATLAS IS CONNECTED TO ON A TRANSCRIPT-SHAPED SCREEN.
//
// A RECIPE A SURFACE CANNOT HONOUR MUST NOT BE SENT — not sent-and-downgraded,
// not sent-and-refused. That sentence was already written above the JSX this
// replaces, and the JSX still broke it, because it checked the wrong thing:
//
//     call.id !== 'demo' ? { kind: 'call', transcriptId: call.id } : …
//
// `!== 'demo'` is a PROXY for "there is a stored transcript", and it named ONE of
// the two screens that have none. The other is
// `/app/company/[id]/period/[period]`, which renders this same view for a quarter
// holding a report and a deck, fabricating `period:<companyId>:<period>` as its
// routing key. That string is not even SHAPED like a transcript id — the chat
// route's `asTranscriptId` requires `[A-Za-z0-9_-]`, and this has two colons and
// a space — so every question asked from that screen came back as a 400,
// "this grounding cannot be honoured", under a caption promising the call.
//
// So the decision moved out of JSX and onto the FACT (`storedTranscriptId`), in
// one pure function, where it can be swept. Deciding it per branch is what let
// the second screen inherit the first one's wrong answer in silence.
//
// THE ORDER IS A LADDER OF HONESTY, most specific first: the call if there is
// one, else the company this screen is about, else blank chat. Never a recipe
// naming something that is not there.
// ─────────────────────────────────────────────────────────────────────────────

export type AskGroundingFacts = {
  /** The transcript row this screen has, or null when it has none. */
  storedTranscriptId: string | null
  /** The company this screen is about, when it is about one. */
  companyId: string | null
}

export function groundingForCall(facts: AskGroundingFacts): Grounding {
  if (facts.storedTranscriptId) return { kind: 'call', transcriptId: facts.storedTranscriptId }
  if (facts.companyId) return { kind: 'company', companyId: facts.companyId }
  return { kind: 'none' }
}
