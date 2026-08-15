// ─────────────────────────────────────────────────────────────────────────────
// HOW MANY CAPTIONS A LIVE TURN PUTS ON THE WIRE.
//
// THIS FILE WAS `turnRoute.ts` (08c-2), and the rest of it is deleted rather
// than moved. Its subject was WHICH BACKEND a turn went to — `chooseChatRoute`
// sent a turn carrying a marked report page or a snipped image to the old
// `/api/chat`, because v2 had no image content blocks, and `legacyLiveContext`
// read the caption text back out of the grounding for that fallback. 08c-3 gave
// the loop image blocks and deleted `/api/chat`, so there is no longer a choice
// to make and nothing for a fallback to read. A module named for a decision
// nobody takes any more is a file the next reader has to disprove.
//
// What survives is the one thing that was never about routing: the request
// ceiling on caption text. It is kept because it is load-bearing, and the
// docstring below says why.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The caption payload a client may put on the wire, bounded so the REQUEST GATE
 * never has to refuse a real call.
 *
 * THE BUG THIS EXISTS TO KILL (cold review, 08c-2). The live view held the whole
 * caption stream and sent all of it on every turn. `parseGrounding` refuses past
 * `LIVE_CAPTIONS_MAX_CHARS`, so a long enough call would have made EVERY question
 * 400 — with the route's English "this grounding cannot be honoured" landing in a
 * Hebrew panel. And the case that broke is precisely the one `buildLiveBlock`'s
 * front-truncation was written to serve: the gate refused before the truncation
 * could ever run.
 *
 * IT KEEPS THE END, matching the server's own truncation direction, so the two
 * cuts cannot disagree about which half of a call the user is asking about.
 *
 * AND IT MUST STAY ABOVE THE INJECTION BUDGET. Capping the client at the budget
 * instead would mean the server never sees more than it can carry, so it would
 * never report `truncated` — the notice would vanish from the screen while the
 * degradation behind it got worse. This is the request ceiling, more than three
 * times the budget, so a long call still arrives visibly over it.
 */
export function clientCaptionPayload(captions: string, maxChars: number): string {
  return captions.length <= maxChars ? captions : captions.slice(captions.length - maxChars)
}
