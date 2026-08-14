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
