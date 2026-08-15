# 09b · The intake takes a company by `@`, not by spelling

Status: BUILT 2026-08-15, NOT MERGED — battery green (1160), driven in both locales
(`docs/evidence/feat-smart-layer-b3-workspace-chat/verify-app.md`, the 09b section). The founder's
own failing case works end to end: `@בז` → בית זיקוק אשדוד → MAYA's real filings → attached.

## Why

The founder tested the workspace intake on `feat/smart-layer-b3-workspace-chat` and reported two
things (2026-08-15, his words): *"when a user is asking to pull a document Atlas doesn't understand,
Atlas needs to say 'hey i dont understand this specific name, can you type the official name of the
company?'"* and *"I asked him to pull בית זיקוק אשדוד, i even clarified it, and he said that he
doesnt have their documents, instead of pulling them. why is that?"*

**Measured** (2026-08-15, live data, repro script since deleted):

| typed | `resolveIssuer` over `maya_issuers` |
| --- | --- |
| `בית זיקוק אשדוד` | ✅ 1361 |
| `בז"א` | ❌ null |
| `בית הזיקוק באשדוד` | ❌ null |
| `בית זקוק אשדוד` (typo) | ❌ null |

MAYA holds **12 offerable filings** for issuer 1361 in the default window, so nothing was missing —
the name never resolved. `company_aliases` DOES know `בז"א → 1361`, but only `chat2/tools.ts` reads
it; the intake matches registered names only. And that table is an alias table in name only: 246
rows over 234 companies, of which **3** are abbreviations (`בז"א`, `בז"ן`, `ORL`) — `companies.name_en`
is filled for 4 of 234 and `tase_security_id` for 3.

Founder's call, after being shown the alias-coverage numbers and an LLM-guess design:
*"why not just allow the user to type @ and then we wont have any problem? it will be accurate"*,
then *"yes lets just do the @ mention."*

**Why @ is the right answer and not a workaround:** it does not guard against the wrong company, it
makes the wrong company unrepresentable — the id travels, the spelling never does. `rules/app.md`'s
M3.3 tier, and the strongest one available here. Ask Atlas has done exactly this since ticket 07
(`ChatView.tsx:224`); the intake is the surface that never got it.

## Scope

The founder scoped this to the `@` mention only ("lets just do the @ mention"). Two structural
defects found in the same investigation are therefore NOT fixed here and are filed at the bottom.

## What ships

1. **`@` in both intake composers** — the tall intro one and the pill one. Reuses
   `components/chat/MentionDropdown` and `/api/companies` unchanged; no new search, no new UI
   vocabulary.
2. **The pick is an id, carried as panel state** — `companyId` goes in the request body beside
   `messages`. It survives every later turn, so a correction is a pick, not a re-spelling.
3. **A VISIBLE chip naming the pinned company, with an unpin** — non-negotiable, and the reason
   this is safe. A pin the user cannot see is the same "confidently wrong company" defect wearing a
   new costume: pin A, then ask for B's report in words, and the request silently carries A.
   `rules/app.md` UI-truthfulness: a scope that exists must be visible and undoable.
4. **The server trusts the id, never the client's issuer number** — `companyId` is looked up in
   `companies` and its `tase_issuer_id` read server-side. 233 of 234 companies carry one.
5. **ONE function decides which issuer the search uses** (M3.1/M3.2), given the facts rather than a
   proxy: `lib/workspace/intake/companyPin.ts`, pure, swept by its own test.

## The decision table `resolveIntakeCompany` owns

| pin | pin has issuer id | model named a company | → issuer searched | → `unknownCompany` |
| --- | --- | --- | --- | --- |
| yes | yes | anything | the pin's | null |
| yes | no | anything | none | the pin's name |
| no | — | yes, resolves | the resolved one | null |
| no | — | yes, unresolved | none | what the model read |
| no | — | no | none | null |

A pin outranks the model's reading of the sentence deliberately: the user pointed at a row.

**One consequence, stated because it is a truthfulness question, not a detail.** The route sets
`sourceError: 'request_not_understood'` when the filter model fails to interpret, and that notice
says *"I couldn't work out which company you meant… so this covers only what Atlas already holds."*
With a pin that reached MAYA, both clauses are false. So that flag is now raised only when no pin
resolved the company — otherwise a green MAYA search would be reported as a coverage failure (M2).

## Verification owed

- `companyPin.test.ts` sweeps all five rows above; registered in `package.json` (`testRegistry`).
- `npx tsc --noEmit`, full battery.
- Browser drive, BOTH locales, per `rules/app.md` M4 — states: dropdown open · picked (chip shown) ·
  unpinned · sent with a pin · sent with no pin (unchanged path). The intake is one of the two
  surfaces 09 changed WITHOUT a drive, so this one is owed twice over.

## NOT in this ticket — found in the same investigation, still open

1. **The MAYA lookup reads only the FIRST user turn.** `intake/route.ts` takes
   `messages.find(m => m.role === 'user')`, and the filter is rebuilt from that same turn every
   message — so a typed clarification of a company name is structurally incapable of correcting it,
   and the first turn is often the sentence handed over from workspace chat, not anything typed in
   the panel. This is the direct cause of the founder's *"i even clarified it"*. The `@` path is
   immune (the pin is state, not text), so this now bites only the typed path.
2. **An unresolved company still gets a fluent answer.** `buildSelectionPrompt` is never told that
   the company failed to resolve, so the model answers confidently from the local shelf
   (*"אין לי את המסמכים שלהם"*) while the honest signal is a grey footnote below it that neither
   names the string that failed nor asks for anything. This is the founder's complaint #1 and it is
   NOT closed by `@` alone — only made avoidable by using `@`.
