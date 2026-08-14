// Shared domain types for the V1 product (companies, calls, quotes). Used by the
// server data layer (lib/db), the route handlers, and the client fetchers (lib/api).

// Type-only, and erased at build. Moved out of `./chat` with its sanitisers:
// the status is a property of a STORED message, so it outlives the `/api/chat`
// wire format that ticket 08 retires.
import type { ProjectContextStatus } from '@/lib/chat/messageState'
// Type-only as well. `lib/calendar/event-meta` imports nothing, so no cycle; the
// calendar's kind vocabulary is defined once, beside its colours and filter chips.
import type { EventKind } from '@/lib/calendar/event-meta'

// DELETED 2026-08-03 — `DEMO_USER_ID = '00000000-…'`, the id used "when there is no auth session
// (public demo)". Its old comment argued it was safe to persist because supabaseAdmin bypasses
// RLS and neither quotes nor followed_calls FK to auth.users. That was the problem, not the
// justification: 16 API sites and two server components fell back to it, so unidentified callers
// read and wrote ONE shared identity's real rows.
//
// The constant is REMOVED rather than merely unused, deliberately. `apiAuthBoundary.test.ts`
// guards `src/app` only, so a `src/components` or `src/lib` file could have re-imported it
// invisibly. Nothing can import what does not exist, which turns a scoped promise into a
// structural one. If you are here because something failed to compile, the answer is to refuse
// the request (`unauthorized()`) or render nothing — never to reinstate a shared identity.

export interface Company {
  id: string
  name: string // official Hebrew name
  displayName: string // short name (e.g. רג"א)
  nameEn: string | null
  ticker: string | null // TASE security id
  /** MAYA's ISSUER id — NOT the ticker. `docs/MAYA-API.md` opens on that distinction. */
  taseIssuerId: string | null
  sector: string | null
  subSector: string | null
  logoUrl: string | null
  description: string | null
  website: string | null
}

export type CompanyLite = Pick<Company, 'id' | 'name' | 'displayName' | 'nameEn' | 'logoUrl' | 'ticker'>

export type CallStatus = 'scheduled' | 'live' | 'ended' | 'processed'
export type CallSource = 'mock' | 'maya'

export interface ScheduledCall {
  id: string
  companyId: string
  scheduledAt: string // ISO timestamp
  quarter: string
  zoomUrl: string | null
  status: CallStatus
  source: CallSource
  transcriptId: string | null
  company?: CompanyLite
  /** What kind of diary entry this is. The calendar's filter chips read it. */
  kind: EventKind
  /**
   * FALSE when MAYA published a date and no time — which is EVERY report
   * publication (0 of 472 carry one, measured 2026-08-09). `scheduledAt` still
   * holds an instant because the column is NOT NULL, but it is midnight Israel
   * time used as a bucket, not something anyone announced.
   *
   * ⇒ Never render a clock for this row. It is the reason the field exists.
   */
  timeKnown: boolean
}

export interface QuoteAnchor {
  segmentId: string
  text: string
}

export interface Quote {
  id: string
  companyId: string
  transcriptId: string | null
  text: string
  speaker: string | null
  quarter: string | null
  startSec: number | null
  anchor: QuoteAnchor | null
  folderId?: string | null // the My-Quotes folder this quote is filed into (null = unfiled)
  createdAt: string
  company?: CompanyLite
}

// A user-named folder for organizing saved quotes (per company). Migration 20260614_010.
export interface QuoteFolder {
  id: string
  companyId: string | null
  name: string
}

// Localized display helpers — pick the right name for the active locale.
export function companyDisplayName(
  c: { displayName: string; nameEn: string | null },
  locale: 'en' | 'he'
): string {
  if (locale === 'en' && c.nameEn) return c.nameEn
  return c.displayName
}

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  /**
   * Set when this answer did NOT get its project's context whole. PERSISTED with
   * the message, not merely held in view state.
   *
   * It rides in the existing `messages` jsonb, so this costs no migration. It is
   * here rather than in the component because the notice used to live only in
   * React state: `saveConversation` wrote `{role, content}`, so one reload turned
   * "answered without your instructions" into an answer that looked complete.
   * A degradation the user can refresh away is not a visible degradation.
   *
   * Always sanitise on READ (see `sanitizeContextStatus`) — this column is a
   * jsonb blob that predates the field, so absent, stale and hand-written values
   * all have to land on `null` rather than on a rendered banner.
   */
  projectContext?: ProjectContextStatus | null
  /**
   * This answer's stream BROKE partway, so the stored text is real but partial.
   * PERSISTED for the same reason `projectContext` is.
   *
   * Without it, the fix for "an error rendered as an answer" quietly created a
   * new false state: the partial text has non-empty content, so it survived the
   * empty-turn filter and was written into the thread on the next successful
   * send as an ordinary complete answer. `errorKind` is view state and does not
   * persist, so one reload turned half an answer into Atlas's whole answer —
   * rendered through Markdown, often mid-sentence, and replayed to the model as
   * its own prior turn. Strictly worse than the untrue-but-visible state it
   * replaced, because nothing on screen says anything is missing.
   *
   * Sanitise on READ like `projectContext`: only `true` counts.
   */
  truncated?: boolean | null
  /**
   * The CALL this answer was grounded in did not fit in one turn, so the model
   * read a prefix of it (ticket 08b, whole-call injection). PERSISTED, for
   * exactly the reason its two neighbours are.
   *
   * A DIFFERENT FACT FROM `truncated`, and merging them would state something
   * untrue. `truncated` says the ANSWER stopped early; this says the INPUT was
   * partial. An answer can be complete, correct and saved, and still have been
   * written from two thirds of the call the chip above it names — so the two are
   * separate fields and can both be set.
   *
   * It was session-only in this branch's first draft, on the reasoning that
   * "nothing re-derives it on reload, and inventing it would be worse than
   * silence". Cold review rejected that and was right: this is a MEASURED fact
   * the server reported on its `grounding` event, so persisting it is recording
   * a measurement, not inventing one — and the alternative is that one refresh
   * turns "based on part of the call" into an answer that looks whole, which is
   * the same defect `truncated` exists to close, arriving through a new door.
   *
   * Sanitise on READ like the others: only `true` counts.
   */
  callTruncated?: boolean | null
}

export interface Conversation {
  id: string
  title: string
  companyId: string | null
  transcriptId: string | null
  messages: ChatMsg[]
  createdAt: string
  updatedAt: string
}

export type ConversationSummary = Omit<Conversation, 'messages'>
