# B1b · Chat surface — @mentions + search mode

Status: ready-for-agent — UNBLOCKED to build, NOT to ship.
Blocked by: 06 (landed 2026-08-14)

**Read before starting.** The backend is on `main` and nothing calls it. Building this is safe now.
SHIPPING it waits on A5's two open gates, and this ticket's own acceptance runs straight through
them: the eval cases are scored against the corpus, and at the time 06 merged only 618 of 1,296
documents were embedded — the rest are invisible to dense retrieval. A red eval today cannot tell
you whether the surface is wrong or the corpus is half-absent. Both gates are named in `STATUS.md`.

Spec §2.3 + §6 B1b. `ChatView` onto the new backend; `@company` autocomplete from the
alias table; visible search mode with per-company-diversified leads answers; degradation
UI in both locales. Acceptance: both MUST-PASS eval cases green end-to-end; class-G
discovery cases green; `/verify-app` both locales, every state; bidi law. Cost:
≤ $0.06/answer.
