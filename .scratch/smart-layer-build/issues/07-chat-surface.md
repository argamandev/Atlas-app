# B1b · Chat surface — @mentions + search mode

Status: **DONE 2026-08-14** (`feat/smart-layer-b1b-chat-surface`). Blocked by: 06 (landed).
Evidence: `docs/evidence/feat-smart-layer-b1b-chat-surface/{measurements,verify-app}.md`.

Spec §2.3 + §6 B1b. `ChatView` onto the new backend; `@company` autocomplete from the alias table;
visible search mode with per-company-diversified leads answers; degradation UI in both locales.

## What landed

- **`chat2/mode.ts`** — pinpoint/search decided from SCOPE alone. `ModeFacts` carries no question
  field, so guessing the mode from the words is unrepresentable, not merely discouraged (app.md's
  classifier law, M3.3). The loop announces the opening mode and every change from one choke point.
- **`corpus/diversify.ts`** — unscoped search round-robins across companies so one issuer cannot
  monopolise a market-wide answer (§2.5.6). Applied only when unscoped.
- **`api/chat2.ts`** — NDJSON client. Buffers frames split across TCP chunks; synthesises
  `incomplete{stream_ended}` when a stream stops with no terminal event.
- **`chat/incompleteCopy.ts`** — nine codes → a sentence, `Record`-typed so a new code cannot ship
  without copy in both locales at build time.
- **`truncatedForPersist`** gains the v2 door — an `incomplete` turn finishes its stream normally,
  so every signal the old fields read said "complete".
- **`searchCompanies`** now searches `company_aliases`: the dropdown was strictly less able to
  recognise a company than the answer engine behind it.
- Project chats stay on the OLD `/api/chat` — v2 takes no `projectId`. **Ticket 08 removes the fork.**

## Acceptance, scored honestly

| Item | Result |
| --- | --- |
| Tool loop vs the real 98K corpus | **Split.** Scoped works end to end; unscoped times out. |
| One answer priced vs $0.06 | **RED** — $0.086 / $0.025 / $0.097; 2 of 3 over. |
| Railway `ANTHROPIC_API_KEY` | **UNMEASURED** — needs a deploy; founder step. |
| MUST-PASS cases 13 + 14 | Green via `resolve_company` + scoped search, as the ticket predicted. |
| Class-G discovery cases | **RED** — the unscoped channel does not complete at all. |
| `/verify-app`, both locales, every state | Green; 1 of 9 incomplete codes rendered live (stated). |
| Bidi law | Green, measured (the `<bdi>` proven load-bearing, not decorative). |

**The two reds were filed with their numbers, not re-scored** — exactly what this ticket instructed.
Both levers are eval-gated retrieval parameters owned by the dedicated retrieval session.

The unscoped failure incidentally proved B1a's honesty machinery against a real unplanned fault:
visible tool errors, terminal `incomplete{all_sources_failed}`, and the model saying so in Hebrew.
No `done`, no fabricated answer, no silence.
