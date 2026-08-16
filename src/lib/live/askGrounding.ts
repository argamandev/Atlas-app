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

// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE PANEL SAYS IT IS CONNECTED TO — decided ONCE.
//
// The panel tells the user this THREE times: a 29px hero, a sub-line promising
// that audio keeps playing, and a caption under the composer. Each used to be its
// own inline expression ending in a catch-all, and three rounds of cold review
// each found one of them lying while the others had just been fixed:
//
//   round 6 — the caption read a `transcriptId` prop instead of the grounding
//   round 7 — the hero still defaulted to "about this call", one line above it
//   round 8 — all three fell through to the COMPANY copy for `{kind:'shelf'}`
//
// Correcting them one at a time is what made this a series. So the question is
// answered in one place, over the WHOLE union, and the `never` below means a new
// `Grounding` variant cannot be added without deciding what this panel says about
// it — the compiler asks, instead of a fourth review round. → app.md M3.1/M3.3.
// ─────────────────────────────────────────────────────────────────────────────

/** Who the panel's copy is about. One per `Grounding` variant, exhaustively. */
export type AskSubject = 'call' | 'live' | 'company' | 'workspace' | 'market'

export function askSubject(grounding: Grounding): AskSubject {
  switch (grounding.kind) {
    case 'call':
      return 'call'
    case 'live':
      return 'live'
    case 'company':
      return 'company'
    case 'shelf':
      return 'workspace'
    case 'none':
      return 'market'
    default: {
      // A new Grounding variant lands HERE as a type error, not on screen as the
      // company sentence. This line is the mechanism, not a defensive default.
      const unreachable: never = grounding
      return unreachable
    }
  }
}

/**
 * Whether the panel may promise that audio keeps playing.
 *
 * FALSE is the honest answer wherever there is no recording — a period page with
 * a report and a deck showed that sentence under a heading about a call that does
 * not exist. A missing line is not a lie; that one was.
 */
export function subjectHasAudio(subject: AskSubject): boolean {
  return subject === 'call' || subject === 'live'
}
