# 08c slice 1 — project grounding on `/api/chat/v2`

Branch: `feat/smart-layer-b2c-project-grounding` · verified 2026-08-15 · local `:3000`, founder's
signed-in Chrome, real Supabase production data.

**Scope of this evidence.** Project-context injection and the death of `ChatView`'s `useV2` fork.
It does NOT cover live captions or multiview PDF/snips — those are 08c's remaining two slices and
`TranscriptChatPanel` still calls the old `/api/chat` for them.

---

## What was measured, and how

### 1. The injection actually reaches the model — not inferred, demonstrated

A standing instruction was written into a real project:

> `Begin every single reply with the exact token ATLAS-PROJ-7788 on its own line, before anything
> else. This is a standing rule for this project.`

A token is used rather than a judgement call ("did it sound like it followed the instructions?")
because compliance then has one unambiguous reading. Three requests, same question:

| Request | Answer | Reads as |
| --- | --- | --- |
| `projectId` set, clean thread | `ATLAS-PROJ-7788\nBlue.` | the project's text reached the model |
| **no `projectId`** (the control) | `Blue.` | the token comes from the project and nowhere else |
| `projectId` + the 4-turn history | `ATLAS-PROJ-7788\nBlue.` | history does not displace it |

The control is the half that matters: without it, a model that happened to emit the token would
have looked like a passing test.

### 2. Both locales, driven live in the browser

- **Hebrew (RTL)** — new thread inside the project, asked `What is 2 plus 2?` →
  `ATLAS-PROJ-7788 2 plus 2 equals 4.`
- **English (LTR)** — new thread inside the project, asked `Name any fruit.` →
  `ATLAS-PROJ-7788` / `Apple.`

The project page itself was checked in both: RTL puts the Instructions/Memory/Context rail on the
left and the breadcrumb right; LTR mirrors both. No layout breakage either way.

### 3. Every state that decides what the screen says (app.md's ritual-gate law)

| State | How it was driven | Result |
| --- | --- | --- |
| `ok` | real project, loaded whole | no notice, answer obeys the instruction |
| `truncated` | persisted flag, thread reopened | notice renders, both locales |
| `failed` | **real RLS** — a well-formed uuid for a project the caller does not own | `projectContext:{state:'failed'}`, turn still ends `done` |
| absent | request with no `projectId` | **no `projectContext` event at all** |
| malformed | `projectId:'not-a-uuid'` | **HTTP 400**, refused — not silently dropped |

`failed` and `truncated` were driven at the RENDERER through a stored conversation reopened from
the database, which is the path the persistence law actually cares about — the notice has to
survive a reload, not merely appear once. Both copies render in the warning colour beneath the
answer they describe:

- HE `failed`: התשובה נכתבה בלי ההקשר של הפרויקט — לא ניתן היה לטעון אותו, ולכן ההנחיות, הזיכרון וההערות שלכם לא הגיעו לאטלס.
- EN `failed`: Answered without this project's context — it could not be loaded, so your instructions, memory and notes did not reach Atlas.
- HE `truncated`: ההקשר של הפרויקט היה ארוך מדי ונחתך, ולכן אטלס לא ראה את כולו.
- EN `truncated`: This project's context was too long and was cut to fit, so Atlas did not see all of it.

**STATED LIMIT (M1):** `failed` was driven end-to-end at the WIRE against real RLS, and at the
RENDERER through a persisted message. It was NOT driven as one continuous live turn, because it
cannot be: the UI only ever sends its own project's id, and **the product has no delete-project
route at all**, so there is no user action that makes a project vanish mid-chat. The two halves
meet at one field (`projectContext`) whose reader is unchanged code that already shipped.

### 4. The fork is gone, proven at the wire

`ChatView`'s outgoing request body was captured by patching `window.fetch` during a real typed
turn:

```json
{ "message": "Name any fruit.",
  "grounding": { "kind": "none" },
  "projectId": "77f000a5-…",
  "history": [ … ] }
```

Dev-server log for the whole session: `POST /api/chat/v2 200` — **zero requests to the old
`/api/chat` from this surface.**

### 5. One observation that is model behaviour, not a defect

In a thread whose history contained several assistant replies that did **not** carry the token
(seeded fixtures), the model stopped emitting it and answered plainly. The same `projectId` and
the same history sent directly returned the token. So this is compliance drift from the
conversation's own precedent, not a wiring fault — established by the captured request body
(`projectId` present), the `projectContext:'ok'` event, and the control request. Recorded here
rather than smoothed over: an instruction is injected, it is not enforced, and nothing in this
slice claims otherwise.

---

## Battery

- `npx tsc --noEmit` — clean
- `npm test` — **1052/1052**, 0 failures
- `npm run env:health` — unchanged; no law added or weakened by this slice
- Mutation-tested the accepted-⇒-consumed guard: removing every `scope.projectId` read from
  `loop.ts` makes `requestScope.test.ts` fail with the intended message. The guard is not vacuous
  for the new field.

## Test data — what was created and what was cleaned

| Item | State |
| --- | --- |
| Instruction added to the founder's project | **reverted to empty**, capacity back to 0% |
| 3 test conversations (1 seeded, 2 real turns) | **deleted**, verified 0 rows remain |
| Throwaway project `24f6eea5-…` "08c throwaway — delete me" | **STILL THERE** |

The throwaway project could not be removed: the app exposes no DELETE for projects, and deleting
the row directly is destructive SQL against production, which the iron rules forbid and the hook
blocks. It is inert and clearly named. Flagged for the founder rather than worked around.
