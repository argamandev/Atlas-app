/**
 * Is a STORED chat message whole, and did its context reach the model?
 *
 * Read-side sanitisers and one write-side decision, all of them load-bearing
 * honesty machinery rather than defensive decoration — each was written for a
 * defect that shipped. The histories are kept on the functions themselves.
 *
 * WHY THIS FILE EXISTS. These lived in `lib/api/chat.ts`, the client for the OLD
 * `/api/chat` route, which ticket 08 deletes. None of them is about that route:
 * `truncatedForPersist` already reads the v2 backend's `incomplete` code, and all
 * three run against messages reopened from `chat_conversations.messages` long
 * after any wire format is gone. Filing them under transport meant the honesty
 * machinery was scheduled for deletion alongside the thing it outlived.
 *
 * Nothing here may import from `lib/api`.
 */

/**
 * How the project's context actually reached the model on THIS answer.
 * `null` means whole (or that there was no project). The other two are things
 * the user has to be told: `truncated` = the block was cut to fit the budget,
 * `failed` = it never loaded and the model answered without their instructions.
 */
export type ProjectContextStatus = 'truncated' | 'failed'

/**
 * Narrow an unknown value to a context status, or null.
 *
 * Used on BOTH ways in: the `x-project-context` response header, and a
 * `projectContext` read back out of a stored message's jsonb. Anything not
 * explicitly named is treated as "the context was whole" rather than guessed at,
 * so a stale row or a hand-edited blob cannot paint a warning onto a good
 * answer — or, worse, a string of someone's choosing onto a rendered surface.
 */
export function sanitizeContextStatus(raw: unknown): ProjectContextStatus | null {
  return raw === 'truncated' || raw === 'failed' ? raw : null
}

/**
 * Was this stored message's answer cut off? Read side.
 *
 * Same reasoning as `sanitizeContextStatus`: the `messages` jsonb predates the
 * field, so most stored messages have none, and absent must mean "complete"
 * rather than "unknown, so warn". Only a literal `true` counts — `'true'`,
 * `1` and `{}` are all truthy in JS and none of them is this flag.
 */
export function sanitizeTruncated(raw: unknown): boolean {
  return raw === true
}

/**
 * Was the CALL this stored answer was grounded in read only in part? Read side.
 *
 * Its own function rather than a second call to `sanitizeTruncated`, even though
 * the body is identical today. These two answer different questions — "the answer
 * stopped early" and "the input was partial" — and a shared reader is how a later
 * change to one silently redefines the other. The names are what keep the two
 * facts apart at every call site, which is the whole reason they are two fields.
 */
export function sanitizeCallTruncated(raw: unknown): boolean {
  return raw === true
}

/**
 * THE HONESTY FACTS A SETTLED ASSISTANT MESSAGE CARRIES — from the ONE place
 * that decides them, so no path can settle a message and forget one (M3.1).
 *
 * WHY THIS EXISTS (cold review, ticket 08c-1, RECURRENCE against "degradation
 * must be VISIBLE"). `ChatView.send` settles its assistant message in TWO
 * places: the success path, which spread every fact off `outcome`, and the
 * `catch`, which built its own object from `error`/`errorKind` alone. So a turn
 * where the server had ALREADY said `projectContext:'failed'` — or that the
 * server had already reported as a partly-read call — and whose stream then
 * broke, rendered its partial answer with NO notice, and persisted none. The
 * facts existed; the second writer simply did not carry them.
 *
 * Every one of those fields is a statement about what the user is looking at,
 * and the failure path is exactly when they matter most. Making both callers ask
 * this function is what stops the next field from being forgotten by the same
 * door: a new honesty fact is added HERE, and both paths get it for free.
 */
export interface SettledFacts<TIncomplete, TSource> {
  source: TSource | null
  projectContext: ProjectContextStatus | null
  incomplete: TIncomplete | null
  callTruncated: boolean
}

export function settledFacts<TIncomplete, TSource>(
  outcome: SettledFacts<TIncomplete, TSource>
): SettledFacts<TIncomplete, TSource> {
  return {
    source: outcome.source,
    projectContext: outcome.projectContext,
    incomplete: outcome.incomplete,
    callTruncated: outcome.callTruncated,
  }
}

/**
 * Should this message be STORED as truncated? Write side.
 *
 * Two sources, and both are needed. `errorKind` is this session's live failure
 * and dies on reload; `truncated` is what a message reopened from storage
 * carries. A message that has already round-tripped has only the second, and a
 * message that just broke has only the first — taking either alone silently
 * drops one of the two cases on the next save.
 *
 * Extracted from an inline expression in ChatView because the defect it fixes
 * (a partial answer persisting as a complete one) was a BLOCKER found at review,
 * and its sibling `sanitizeContextStatus` had a dedicated test file while this
 * had none. A later refactor writing `!!m.truncated` would have failed nothing.
 */
export function truncatedForPersist(m: {
  truncated?: boolean | null
  errorKind?: string
  /**
   * THE V2 SOURCE (ticket 07). The new backend does not break a stream to say an
   * answer is partial — it ENDS it in an `incomplete` event with a code, which is
   * an ordinary, successful HTTP response. So a v2 turn that hit its length limit
   * has no `errorKind` at all: the stream finished, the promise resolved, and
   * every signal the two fields above read says "complete".
   *
   * Missing this third source would have reintroduced the exact BLOCKER this
   * function exists for, by the one door its tests did not watch — a partial
   * answer persisting as a whole one, now arriving through the honesty machinery
   * built to prevent it rather than around it.
   */
  incomplete?: string | null
}): boolean {
  return m.truncated === true || m.errorKind === 'truncated' || m.incomplete != null
}
