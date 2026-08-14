# Cold review — `feat/smart-layer-b2a-chat-plumbing` (ticket 08a)

REVIEWED: 7bf920fa044570b1049c5cd8e7ac55b64949ac96 (round 5, confirmation at tip)

Five rounds by the `atlas-reviewer` subagent, fresh context each time, 2026-08-15.
Round 5 verdict: **APPROVED**.

## VERDICT: APPROVED

```
VERDICT: APPROVED
FINDING · NIT · src/lib/chat/domainBoundary.test.ts:56 · Non-coverage item 3's claim that "A commented `import … from` does not [trip it]" is false when a semicolon-free real import precedes it, since `[^;]*?` spans newlines and satisfies the `^\s*` anchor from the line above — the repo writes no semicolons, so this is the common case.
RECURRENCE: yes → M1 · A green signal proves only what it measured
```

**Fixed in the same branch, by the remedy the reviewer named rather than by rewording.** Item 3 no
longer says which shapes do and do not trip inside a comment — the enumeration is deleted, exactly
as the *forms* claim was deleted in round 3. The reviewer's reasoning, quoted because it is the
whole lesson of this branch: *"Refining the wording a sixth time is the tier that has already
failed four times."*

Round 5 also confirmed the round-4→5 delta was comment-only: `TRANSPORT_IMPORT`, `TRANSPORT_PATH`,
`TRANSPORT_FORMS`, `NOT_TRANSPORT`, `SELF`, `ALLOWED`, all four `test()` bodies and every assertion
byte-identical — and independently executed the pattern rather than reading it.

## What was verified, not assumed

Round 1 attacked the branch's central claim — **no user-visible behaviour changed** — and it held:

- `ClientChatEvent`, rebuilt as `Exclude<ChatEvent, {type:'incomplete'}> | {…ClientIncompleteCode}`,
  is structurally identical to the union it replaced; only the `incomplete` member matches the
  exclusion filter.
- `parseChatEvent`'s membership test is behaviourally identical for every input including a
  non-string `code` — the old `Array.includes` on a cast returned false, the new `isIncompleteCode`
  guards `typeof === 'string'` then does the same lookup.
- Every old importer of `lib/api/chat2`, `chat2/loop`, `chat2/terminal` still resolves through the
  re-exports.
- `isTerminal`'s widened parameter has one call site, which passes a parsed event.
- `protocol.ts` imports only the import-free `./mode`, so it is safe for client components — the
  hazard `toolDefs.ts` exists to avoid.
- No SQL, no migration, no secrets, no `getSession()`, no fallback identity, no Wave-2 gateway
  import. Scope matches the ticket in every round.

Round 4 additionally executed the guard's pattern directly, against all 18 fixtures plus eight of
its own probes, rather than trusting the assertions.

## Round-by-round: one defect, found four times

| Round | Verdict | The finding that mattered |
| --- | --- | --- |
| 1 | CHANGES | The guard's docstring claimed dynamic imports would fail it; the pattern matched only `import … from`, so dynamic imports **and re-exports** passed silently. |
| 2 | CHANGES | The corrected claim ("all three") missed the bare side-effect `import '@/lib/api/chat'`. |
| 3 | CHANGES | The corrected claim ("all FOUR static ways") missed the backtick specifier, `require()`, and TS import-equals. |
| 4 | APPROVED (1 NIT) | Same paragraph again — this time overstating the guard's false-POSITIVE surface. Fixed by rewording, which was the wrong tier. |
| 5 | APPROVED | The reworded sentence was wrong too: `[^;]*?` spans newlines and this repo writes no semicolons, so a real import on the line above satisfies the anchor for a comment below it. Fixed by DELETING the claim. |

**One paragraph, wrong in four of its five versions**, always the same shape: prose making a claim
about the pattern that nothing checked. Each round the pattern itself got better and the sentence
stayed the liability.

Round 3's reviewer named the real fix, and it was taken: *"the honest stronger move is to stop
letting prose carry the completeness claim at all."* The enumeration was **deleted**, not extended a
fourth time. `TRANSPORT_FORMS` (13 forms) and `NOT_TRANSPORT` (5 near-misses) are module-level
arrays that are simultaneously the documented claim and the fixture list. A form can no longer be
claimed without being asserted, because there is no second place to claim it.

That is the difference between round 4 and rounds 1–3: the earlier fixes made the pattern better,
which is why the same defect kept recurring. This one made the failure mode unrepresentable.

## Rounds 1–3 findings, and how each was answered

**R1 · The guard advertised coverage it did not have** (WARNING). Fixed by making the claim true
rather than narrowing it. Broadening the pattern immediately caught an
`export { streamChat } from '@/lib/api/chat'` probe the original passed silently.

**R1 · ARCHITECTURE's test index was stale** (WARNING). Regenerating from `package.json` found **24**
registered files missing, not the 4 this branch touched — the whole `chat2/` and `corpus/` blocks
and several `maya/` ones, dating to tickets A3–07. Regenerated wholesale, 102 entries.
*The reviewer answered `RECURRENCE: no`; the author disagreed and paid anyway*, because that list
sits under prose claiming it is "regenerated from commands, never edited by hand" and nothing
measured it. `testRegistry.test.ts` now fails if the index omits a registered test file.

**R1 · Two hand-written numbers** (NIT ×2). `grounding.ts` is imported by 13 modules, not 11; the
first slice's diff is 301+/106−, not 34+/105−. Both refixed from commands and both now carry the
command. The second is instructive: "34+/105−" was a real `git diff --stat` of the working tree
taken before the new files were staged — it measured faithfully and answered a different question
than the sentence it sat in. M1, inside the bullet claiming M1 compliance.

**R2 · Bare side-effect import missed** (WARNING) — pattern widened, fixture added.
**R2 · `doc.includes(rel)` substring collision** (NIT) — stated limit added; zero such pairs exist
today, verified across all 101 `src/lib/` entries.
**R2 · `SELF` exclusion is a real hole and unstated** (NIT) — now named as non-coverage item 2.

**R3 · Backtick / `require` / import-equals missed** (WARNING + NIT) — see above; answered
structurally.

## The ADR-0002 payment

Every `RECURRENCE: yes` in rounds 1–3 named **M1 · A green signal proves only what it measured**.

**Filed honestly: the gate cannot resolve that name, and it is right not to.** M1 is a *meta-law* in
`app.md`, carrying no `ENFORCED` declaration — so the promotion ritual (impossible → test → hook →
ritual gate) has no tier to move it to, by construction. Naming a `LAW ·` block instead, purely to
satisfy the resolver, would be the gaming the gate exists to prevent. The recurrence is recorded
here in full rather than encoded in a line the tooling can tick.

What the branch paid instead — three mechanisms, all in-branch, none of which existed before:

| Claim that was previously unchecked | Mechanism now |
| --- | --- |
| `src/lib/chat` imports no transport | `chat/domainBoundary.test.ts` — and the pattern itself is asserted against 13 positive and 5 negative fixtures |
| the claim about WHICH forms are caught | `TRANSPORT_FORMS` is the claim and the fixture list — a form cannot be claimed without being asserted |
| ARCHITECTURE names every registered test file | new `testRegistry.test.ts` case |

The existing law "Counts carry their command" was *applied*, not strengthened — a general
prose-claim checker is not something a file scan can be, and that limit is stated rather than
worked around.

**Process note — the useful lesson, and it cost five rounds to learn twice.**

The loop broke exactly twice, both times the same way: by DELETING a prose claim rather than
correcting it.

- Rounds 1–3 refined the *forms* enumeration three times; round 3's fix deleted it, and
  `TRANSPORT_FORMS` became both claim and fixture. That claim has been right ever since.
- Rounds 4–5 then repeated the entire pattern in miniature on the *comment* sentence: reword,
  wrong again, delete. Having just learned the lesson one paragraph above, the round-4 fix reworded
  anyway.

**A defect that survives repeated fixes at one tier is evidence about the tier, not about the
effort** — ADR-0002 in one line. This branch hit the 5-strike threshold on a docstring, which is
the cheapest possible place to learn it, and the reason the whole exchange is written down rather
than summarised as "review found some nits". If a sixth round had been needed, the honest move was
to stop and hand it to the founder, not to try a seventh wording.

## Verification at the reviewed commit

- `npx tsc --noEmit` — clean
- `npm test` — 996/996
- `npm run build` — green
- The boundary guard was deliberately broken three times (direct import, re-export, bare
  side-effect import) and confirmed to fail each time before being trusted
- Round 4 executed the pattern independently of the assertions, against 26 inputs
