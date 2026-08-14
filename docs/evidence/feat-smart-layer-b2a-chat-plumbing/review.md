# Cold review — `feat/smart-layer-b2a-chat-plumbing` (ticket 08a)

Reviewed 2026-08-15 by the `atlas-reviewer` subagent, fresh context, against `main`.

## What the review confirmed

The branch's central claim — **no user-visible behaviour changed** — was attacked directly and
held. Verified independently on the branch (`npx tsc --noEmit` clean, `npm test` 994/994):

- `ClientChatEvent`, rebuilt as `Exclude<ChatEvent, {type:'incomplete'}> | {…ClientIncompleteCode}`,
  is structurally identical to the union it replaced — only the `incomplete` member matches the
  exclusion filter.
- `parseChatEvent`'s membership test is behaviourally identical for every input including a
  non-string `code`: the old `Array.includes` on a cast returned false, the new `isIncompleteCode`
  guards `typeof === 'string'` and then does the same lookup.
- Every old importer of `lib/api/chat2`, `chat2/loop` and `chat2/terminal` still resolves its names
  through the re-exports.
- `isTerminal`'s widened parameter has exactly one call site (`api/chat2.ts:69`), which passes a
  parsed event — nothing weakened.
- `protocol.ts` imports only the import-free `./mode`, so it is safe for client components (the
  hazard `toolDefs.ts` exists to avoid).
- No SQL, no migration, no secrets, no `getSession()`, no fallback identity, no Wave-2 gateway
  import. Scope matches the ticket.

## VERDICT: CHANGES → all four findings fixed on this branch

```
VERDICT: CHANGES
FINDING · WARNING · src/lib/chat/domainBoundary.test.ts:36 · The stated limit claims a dynamic `await import('@/lib/api/…')` "would read as an import here and fail the test", but `TRANSPORT_IMPORT` requires `import … from`, so a dynamic import — and equally a re-export `export { X } from '@/lib/api/y'` — is invisible to the scan and passes silently, meaning the mechanism advertises coverage in the unsafe direction it does not have.
RECURRENCE: yes → M1 · A green signal proves only what it measured
FINDING · WARNING · ARCHITECTURE.md:336 · The test index still names `api/contextStatus.test.ts` and `api/messageFlags.test.ts`, both of which this branch moved to `src/lib/chat/`, and neither of the two new test files was added to that list.
RECURRENCE: no
FINDING · NIT · ARCHITECTURE.md:304 · `chat/grounding.ts` is described as "imported by 11 modules"; `git grep -l "chat/grounding" -- src` returns 13.
RECURRENCE: yes → M1 · A green signal proves only what it measured
FINDING · NIT · PROGRESS.md:46 · The CRLF-trap evidence cites "(34+/105−)" for the first slice; `git diff --shortstat a7435f2^ a7435f2` is 301 insertions / 106 deletions (and `-w` agrees, so the underlying conclusion is right and only the quoted pair is wrong).
RECURRENCE: yes → M1 · A green signal proves only what it measured
```

## How each was answered

**1 · The guard advertised coverage it did not have.** The worst of the four: a mechanism whose
docstring overstates it is worse than no mechanism, because the next reader trusts it. Fixed by
making the claim true rather than by narrowing the claim — `TRANSPORT_IMPORT` now matches all three
ways a module reaches transport (`import … from`, `export … from`, dynamic `import(…)`), and a new
case asserts the pattern against six positive and three negative fixtures, because a file scan that
finds nothing looks identical whether the rule holds or the regex is broken.

Broadening it immediately caught a violation the original would have missed: an
`export { streamChat } from '@/lib/api/chat'` appended to `messageState.ts` as a probe was flagged,
where the old pattern passed it silently. The scan also had to stop reading itself — it holds the
fixture strings — which is a category error, not a debt, so it is excluded by name and not via
`ALLOWED`. What stays genuinely invisible (a specifier built from a variable) is now stated.

**2 · The stale test index.** Fixed, and it was far staler than the finding: regenerating the list
from `package.json` showed **24** registered files missing, not the 4 this branch touched — the
whole `chat2/`, `corpus/` and several `maya/` blocks had never been added, dating back through
tickets A3–07. The list was regenerated wholesale from the command, 102 entries, matching the
registered count.

**RECURRENCE was answered `no` by the reviewer; the author disagrees and paid anyway.** The index
sits under prose claiming it is "regenerated from commands, never edited by hand", which nothing
measured — the same shape as findings 1, 3 and 4. So `testRegistry.test.ts` gained a case:
**ARCHITECTURE.md's test index must name every registered test file.** That is the mechanism one
tier out from the ship gate, which already re-measures the two counts in that header but never read
the list beneath them. Stated limit written into the test: it proves each registered path is
mentioned, not that the index is free of extra names, because the file legitimately discusses other
test files in surrounding prose.

**3 and 4 · Two hand-written numbers.** Both fixed from commands, and both now carry the command
that produced them. Finding 4 is the instructive one: "34+/105−" was a real `git diff --stat`, taken
against the working tree before the guard test and the moved files were staged. It measured
faithfully — it just answered a different question than the sentence it sat in, which is M1's
definition, occurring inside the bullet that claimed M1 compliance.

## The ADR-0002 payment, stated plainly

Three findings named M1 — a meta-law, and one nothing can enforce in general. The recurrence is not
"M1 needs restating"; it is that **this branch wrote four claims no mechanism checked**. Two of them
are now checked by a test that did not exist before:

| Claim | Before | After |
| --- | --- | --- |
| `src/lib/chat` imports no transport | prose + a regex missing 2 of 3 forms | test, with the pattern itself asserted |
| ARCHITECTURE names every registered test | nothing | `testRegistry.test.ts` case |
| counts in prose (13 modules, 301+/106−) | memory | the command, written beside the number |

The third row is the existing law ("Counts carry their command"), applied rather than strengthened —
a general prose-claim checker is not something a file scan can be; that limit is honest, not a
shortcut.

## Verification after the fixes

- `npx tsc --noEmit` — clean
- `npm test` — see the merge commit; the two new cases are `chat/domainBoundary.test.ts` (4 cases)
  and the `testRegistry.test.ts` index case
- `npm run build` — green
- The boundary guard was deliberately broken twice (a direct import, then a re-export) and confirmed
  to fail each time before being trusted
