# Round 2 — buying the invariant instead of another word list

**Branch** `feat/workspace-tables` · **lane** multiview · **date** 2026-08-08
**Commits** `005597c` (the blocker) · `d7b5384` (the four warnings)
**Battery** 556 tests / 0 fail (was 545) · `tsc --noEmit` exit 0 · `next build` green

Round 2's verdict was **CHANGES**: one BLOCKER, four WARNINGs, two NITs. Every finding
reproduced against this source before anything was changed — the runs are below.

The review's central instruction is the reason this round looks the way it does:

> No word list will ever be complete — Hebrew and English both have unbounded ways to say
> "only those two". Adding אל-exceptions buys one round and loses the next. Buy the property
> instead: being wrong must FAIL VISIBLY.

---

## The blocker: the round-1 fix opened it

Refusing a narrowing that did not narrow was right. Refusing it **silently** was not.
`resolveSelection` returned a bare `[]`, the status stayed `ready` because the model had said
so, and `selectSources.ts:210` REQUIRES a `ready` reply to announce that the files are being
pulled in. Three individually reasonable layers, one untrue screen: *"great, I'm pulling them
in now"* over no file, no spinner (the panel needs a non-empty selection to render one) and no
notice. And an empty selection carries no `proposed`, so the standing set cleared too and the
next "כן" also did nothing.

It fired on the intended path **and on ordinary agreements**, because `NARROWING` holds
`לא`/`no` — the first word of a widening as often as of a cut. Reproduced against the shipped
source before the fix:

| message | | resolved |
|---|---|---|
| `לא, את כולם` | "no — ALL of them" | **0 files** |
| `no, all of them` | | **0 files** |
| `בטח, למה לא` | "sure, why not" | **0 files** |
| `כן, בדיוק אלה, לא צריך לשאול שוב` | "yes, exactly these, no need to ask again" | **0 files** |
| `no problem, go ahead` | | **0 files** |

### What was built instead of a longer list

**`src/lib/workspace/intake/respond.ts`** — `ready` with an empty selection is now
unrepresentable. It is its own module for two reasons: so the invariant is unit-testable, and
so it is a *choke point* rather than a check at the site that happened to have the bug. The
route had four exits; a check on the one that failed would have passed review and left three.

**`resolveSelection` returns `{ ids, conflict }`, not a list** — a caller cannot read a
detected contradiction as ordinary emptiness. That is invariant (b): when the model's prose
and its ids disagree, the disagreement is information, and it goes to the analyst.

**Two new lines, in both locales.** Deliberately not `intakeNotInterpreted` — the model *did*
answer, so "I could not work that out" names a failure that did not happen, and `rules/app.md`
forbids inventing a cause.

### Proven in the browser, against the real route

Real session, real corpus, real model, real MAYA. Standing proposal of three
(`דוח רבעון 1 לשנת 2026`, `דוח תקופתי ושנתי לשנת 2025`, `דוח תקופתי ושנתי לשנת 2024`), Atlas
asking *"להביא את שלושתם?"*. `LIE` = the forbidden state, `ready` with nothing selected:

```
B1  "לא, את כולם"                      clarifying files=17  LIE=false
B2  "no, all of them"                   clarifying files= 6  LIE=false
B3  "בטח, למה לא"                       clarifying files= 2  LIE=false
B4  "כן, בדיוק אלה, לא צריך לשאול שוב"  ready      files= 3  LIE=false
B5  "no problem, go ahead"              clarifying files= 2  LIE=false
CTRL  plain "כן"                        ready      files= 3  replyNull=true
CTRL  "כן, רק את הראשון"                clarifying files= 1
```

Both controls hold: a plain "כן" still pulls all three, and the narrowing still cuts to one.
**B4 is the sentence the review singled out** — the one a frustrated analyst types *because* of
the loop this module exists to kill — and it now pulls its three files instead of announcing a
pull of nothing.

The two honest lines were then verified rendering in the panel, in both locales, with the
intake response stubbed to the shape the fixed server emits. **What that step proves and what
it does not:** it proves the panel half — the wording, the RTL layout, no bidi damage. The
server half is proven separately by `respond.test.ts` and by `LIE=false` across every live run
above.

> EN — "I didn't end up with a file to add, so I've added nothing. Tell me which ones you want and I'll bring them in."
> EN — "I read that as narrowing the list, but what came back was still all of them — so I've added nothing rather than guess. Which ones should I bring in?"
> HE — "לא נשאר לי קובץ להוסיף, אז לא הוספתי כלום. אפשר לומר לי אילו קבצים להביא?"
> HE — "הבנתי שהרשימה צומצמה, אבל מה שחזר אצלי היה עדיין כולם — אז לא הוספתי כלום במקום לנחש. אילו מהם להביא?"

Console clean. Both verification workspaces deleted; the picker is back to the founder's 12
rows. The locale I switched was switched back.

---

## Warning 1 — the question detector, and the half nobody had looked at

The review filed this against `agreedToStandingSet`. Measuring it found the worse half:
**every one of those strings was also a bare agreement**, and that path attaches the standing
set with NO model call and no set comparison behind it. An analyst checking Atlas's work was
triggering the pull by asking about it.

```
isBareAgreement('is that right')   === true      ← before
isBareAgreement('you sure')        === true
isBareAgreement('ok is that all')  === true
```

`right` and `sure` are agreement words; everything around them was filler.

`looksLikeQuestion` does not enumerate questions — that is the open-vocabulary trap again. It
reads the three marks a question leaves in the grammar, all of which are closed sets:

1. **an interrogative** — מה, איזה, כמה, what, which, how…
2. **English subject-auxiliary inversion.** *"that is right"* is a statement and *"is that
   right"* is a question; the only difference is the order. This is what catches *"ok is that
   all"*, where the interrogative-free question hides behind an agreement word and a
   trailing-`?` test sees nothing.
3. **the second person** — you do not address someone in order to agree with them. *"you
   sure"* is an elided *"are you sure"*. `thank you` is the one ordinary exception.

> A test caught the first version over-firing: `do` + `it` parsed as inversion, so *"do it"* —
> this file's own example of a plain yes — was read as a question. An English **imperative uses
> the bare verb form**, so only the inflected and modal auxiliaries mark inversion
> unambiguously; `do` and `have` are out of that set, and nothing is lost because *"do you
> want"* is caught by the second-person rule.

## Warning 2 — the closed vocabulary overshot, and the copy was the error

Round 1 fixed `agreedToStandingSet` by copying `isBareAgreement`'s closed vocabulary. Round 2
measured what that cost — all refused, all plain agreements, all dropped back into founder
complaint #1:

```
"yes, both of them"        false   ← the word "of"
"yes, all three"           false
"go ahead with both"       false
"כן, תביא את שתי השיחות"    false
"כן, את שלושת הדוחות"       false
```

**The two functions do not stand on the same ground, and a shared vocabulary pretended they
did.** `isBareAgreement` runs INSTEAD of a model — nothing re-checks it, so an unknown word
could be anything and the vocabulary must be closed. `agreedToStandingSet` runs AFTER a model
returned a set, and only promotes when that set is exactly the one already named in prose and
shown to the analyst.

So the question is not "is every word known?" but "does this message re-shape the ask?" — and
the division of labour falls out of what the set comparison can and cannot see:

- **it catches CHANGES.** *"כן, ותוסיף גם את הדוח של טבע"* makes the model return a different
  set, and the comparison fails. No vocabulary needed.
- **it is blind to QUESTIONS.** The prompt asks for the standing set at *both* statuses, so a
  message *about* that set matches it. This was the review's own round-1 diagnosis.

Five things now refuse a promotion, each one something the set comparison could miss: a
QUESTION, an ORDINAL (*"the first one looks right"* — an ordinal picks an element out of a list
rather than agreeing to it), a NEGATION, a PERIOD (a year or quarter — *"yes, the 2025 ones"*
is a new request), and a **bare KIND word**. That last is the one judgement worth stating:
*"the reports"* opens a category, *"the three reports"* points back at the set just counted for
you — so a KIND word is refused alone and allowed beside a COUNTED one. It is pinned by its own
test, because it is the pair a future session is most likely to flatten back into one list.

**What remains unguarded, stated rather than glossed:** a fresh request naming no period, no
kind and no ordinal — *"כן, של תיגבור"* — promotes if the model answers it with the standing
set. That is the residual of a real trade. The error it allows spends one MAYA download on
files the analyst can remove from the shelf; the error the closed vocabulary allowed was the
re-confirmation loop this module exists to end.

## Warning 3 — NARROWING is incomplete, in both directions

The words the review named are added (`בלבד`, `מספיק`, `skip`, `drop`, `תוריד`…) plus ordinals,
so all five of its misses now register. `just` stays out on purpose — *"ok, just go ahead"* is
filler far more often than a cut.

But the list is not the fix, and the function's header now says so in as many words: it is
incomplete in both directions, no list will ever close it, and **what makes that survivable is
that a wrong `true` empties the selection and an empty selection can no longer be reported as a
successful pull.** Wrong now costs one honest question.

## Warning 4 — the orphaned docstring

`reconcileSelection`'s docstring survived its deletion and still stated the invariant the
round-1 fix REVERSED — *"a file merely left out has not been declined by anyone, so it stays"* —
about 200 lines above the new header saying the opposite. Deleted, with a tombstone recording
what stood there. `types.ts:111` no longer points readers at a function that does not exist.

Round 1's blocker class reappearing inside the file that fixed it. **Deleting a function means
deleting what it promised, in the same commit.**

## The two NITs

The dangling JSDoc above `lastAssistantTurn` is gone and `lastProposal` has its own — including
the cost the review asked be written down: **one failed selection turn now permanently erases
an agreed set** the old scan-back preserved. A 7s `askModel` timeout carries no `proposed`, that
becomes the last assistant turn, and a set agreed two turns earlier is gone. Reachable by a
network hiccup rather than by anything the analyst typed. Accepted deliberately: the panel is
honest about it, and the alternative is a lookup that can resurrect a set the analyst discarded.

---

## Both guards were proven to fail on the bug they guard

The battery's own law, after a guard once passed on a reintroduced bug.

```
neutered the invariant in respond.ts
  ✖ ready with an empty selection cannot leave the route
  ✖ a detected conflict keeps its own, more specific cause

added a second exit bypassing respond()
  ✖ the intake route builds its result envelope in exactly one place
    expected one { result } envelope (inside respond()), found 2
```

Both files restored; battery re-run green on the restored tree.

---

## ⚠ FOUND WHILE VERIFYING, NOT FIXED — and this is the finding I would read first

**The standing proposal is not durable in practice. Any turn that reaches the model can
silently replace it.**

The whole point of `IntakeTurn.proposed` was to hold the agreed set so it stops being
re-derived every turn. It *is* held — and then `resolveSelection` lets a fresh model selection
overwrite it. Measured on the standing proposal of three, six consecutive turns:

```
"בטח, למה לא"                       clarifying  files=2/3  notInProposal=1
"no problem, go ahead"              clarifying  files=2/3  notInProposal=1
"כן, רק את שלושתם"                  clarifying  files=2/3  notInProposal=1
"כן, תביא את שלושתם"                clarifying  files=2/3  notInProposal=1
"yes, all three of them"            clarifying  files=3/3  notInProposal=1
"כן, בדיוק אלה, לא צריך לשאול שוב"  ready       files=2/3  notInProposal=1
```

**6/6 substituted a file. 5/6 shrank three to two.** What the analyst sees against what gets
stored, from one run:

> **Atlas says:** *"אז אני מביא לך את דוח הרבעון הראשון של 2026, את הדוח התקופתי והשנתי לשנת
> 2025, ואת הדוח התקופתי והשנתי לשנת 2024 של קבוצת תיגבור. לאשר ולהמשיך?"* — three files.
> **Actually stored:** `דוח דירקטוריון Q1 2026`, `דוח תקופתי ושנתי לשנת 2024` — two files, and
> the first is a **different document** from the `דוח רבעון 1 לשנת 2026` it just named.

The analyst then says "כן", `isBareAgreement` pulls that stored set verbatim without a model,
and they get two files, one of which they were never offered. **That is the founder's original
2026-08-04 complaint** — *"he only pulled 1 file while i asked for two files and we agreed on
them"* — arriving through a door nobody has looked at.

**Not fixed this round, deliberately:**

1. It is **pre-existing at `clarifying`**, which is the common path — that branch honoured the
   model's set before this branch existed and still does. The round-1 change altered only the
   `ready` path, where the old union would have produced four files (three right, one wrong)
   instead of two (one right, one wrong). Neither is correct; the union was worse.
2. The fix means deciding **when a model selection may replace a standing set** — which is the
   exact question the round-1 blocker turned on. Re-introducing conditional merging at the end
   of a fix round is how the last two rounds each opened a door. It wants cold eyes and its own
   round.
3. The shipped invariant bounds the dangerous direction. This defect is in the recoverable one:
   too few files, visible on the shelf, removable.

Also observed and unfixed, same runs: the model writes *"אז אני מביא לך…"* ("so I'm bringing
you…") at status `clarifying`, which `selectSources.ts` explicitly forbids — the rule added
2026-08-07 for exactly this. Prompt behaviour, not code.

## Not touched, per the review

`lib/maya/ingestFiling.ts` — the deferral was checked and accepted, and it goes with the
publication-date column in the MAYA phase. One migration, one review. No migration this round.
