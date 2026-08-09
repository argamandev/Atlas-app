# The calendar empty state — measured in a browser, not reasoned about

Branch `fix/calendar-empty-state` (supervisor-authored, on top of Lane M's `98a6d59`).
Verified 2026-08-09 on `:3000` in the founder's authenticated Chrome, `/app/calendar`.

## Why this file exists

Three review rounds died on one sentence, and **every one of them was a reasoning failure that a
browser would have caught in a minute**:

1. Round 1: the guard was a JSX condition `kinds.size > 0` that could never be false.
2. Round 2: the decision moved into `calendarEmptyState` (correct) but was fed whole-feed kind
   sets (a proxy), so it still lied whenever a month's events were all of the filtered-away kind
   — and the test beside it asserted that outcome, so the battery defended the defect.
3. Round 3 (this branch's first tip): the fix for round 2 dropped the `mode === 'all'` guard, which
   made both month messages reachable in "My calendar", where they are claims about the whole feed
   made from a followed-calls-only scope. **That regression was introduced by the supervisor, in
   the commit fixing the same defect class, and was caught by a cold reviewer — not by 610 green
   tests, not by `tsc`, not by a green build.**

The through-line: **this defect class survived by living in states nobody rendered.** So this round
rendered all of them.

## What was driven, and what appeared

Every row below is a real interaction in a real browser, read back from the DOM (not from a
screenshot, and not from the source). Month/mode/chips were driven by clicking the actual controls.

### Full market (`mode = 'all'`), EN

| # | State | On screen | Message |
|---|---|---|---|
| A | November 2026, both chips on | 2 event pills | *(none)* — correct, content is showing |
| B | **November 2026, "Reports" OFF, "Investor calls" ON** | 0 event pills | **"This month's events are all hidden by the type filter — turn a type back on to see them."** |
| C | November 2026, both chips off | 0 event pills | same as B |
| D | November 2026, chips restored | 2 event pills | *(none)* |
| E | **July 2027 (past the feed's last row), all chips on** | 0 event pills | **"Nothing scheduled this month"** |

**B is the defect.** November 2026 holds 2 report dates and 0 calls — measured in the live DB
(`2026-11 → 2 reports, 0 calls`; `2027-03 → 1 report, 0 calls` is the only other single-kind
month). Before this round it printed *"Nothing scheduled this month"* over those two real events,
with the "Investor calls" chip still switched on. **E proves the honest case still works** — a
month that genuinely holds nothing still says so, which is the whole reason the message exists.

### My calendar (`mode = 'mine'`), EN

| # | State | On screen | Message |
|---|---|---|---|
| F | Following nothing | — | **"You are not following any calls yet"** |
| G | 1 followed event, its own month | 1 event pill | *(none)* |
| H | **1 followed event, a DIFFERENT month (September 2026)** | 0 event pills | **"Nothing in your calendar this month"** |
| I | **1 followed event, its month, both chips off** | 0 event pills | **"Your calendar's events this month are all hidden by the type filter…"** |

**H is the round-3 regression, fixed.** September 2026 holds **6 events in the feed**. The
unscoped string would have stated that nothing is scheduled that month — false about the schedule,
true only about this analyst's follow list. The copy now names the scope instead of the condition
being narrowed back to one mode, because silence (the pre-round-3 behaviour) is ambiguous rather
than honest.

### Hebrew (`dir="rtl"`, `lang="he"`)

**All four strings were rendered and read back from the DOM** — the scoped/unscoped pairs are
genuinely different, which is the whole point of the change:

- scoped, filtered: `אירועי היומן שלכם בחודש זה מוסתרים על ידי סינון הסוגים — הפעילו סוג כדי לראות אותם.`
- unscoped, filtered: `אירועי החודש מוסתרים על ידי סינון הסוגים — הפעילו סוג כדי לראות אותם.`
- **scoped, empty month:** `אין אירועים ביומן שלכם בחודש זה`
- not-following: `עדיין אינכם עוקבים אחר שיחות`

> ⚠ **The third bullet was added after a cold reviewer caught this section claiming "both new
> strings render" while exhibiting only one of them.** It was right: at first writing, Hebrew
> `noEventsThisMonthMine` had been reasoned about, not rendered. It has now been driven — follow a
> call, switch to היומן שלי, page to the next month — and the string above is what appeared. On a
> branch whose entire history is claims outrunning observation, the fix was to go and look, not to
> soften the sentence. That required a second follow/unfollow round-trip; `followed_calls` was
> re-checked afterwards and again holds only the two June orphan rows.

All three are pure Hebrew with no Latin runs or digits, so no `<bdi>` is required — the `rules/app.md`
bidi rule applies to MIXED lines, and these are not mixed. Screenshot taken: RTL layout correct
(sidebar right, chips left, day headers reversed, message centred and reading right-to-left).

## Battery

`610 tests · 0 fail` · `npx tsc --noEmit` exit 0 · `npm run build` green, Middleware 81.8 kB.
Console on `/app/calendar`: **zero errors, zero warnings** (only React's DevTools info notice).

**The guard was proven to fail before it was trusted:** reintroducing round 2's behaviour
(`filtered-away` → `no-events`) turns **4 of the 19 tests** in `event-meta.test.ts` red.

## Founder data touched, and restored

Reaching states G–I needs a followed call, so **one call was followed and then unfollowed** through
the UI. Verified afterwards by SQL: `followed_calls` holds 2 rows, both created in June 2026 under
the all-zeros `DEMO_USER_ID` identity with no matching `auth.users` row — pre-existing orphans,
neither of them mine. The round-trip left nothing behind.

> Side observation, filed not fixed: those two orphan rows are exactly what the `DEMO_USER_ID`
> removal (2026-08-03) left in place, and they persist because `followed_calls` is one of the five
> tables `rules/db.md` records as having `user_id NOT NULL` with **no foreign key** to
> `auth.users`. Not this branch's business, and harmless — they belong to nobody, so nobody sees
> them — but it is what a missing FK looks like in production.

## What this file does NOT show

- The `Logo` monogram fallback has **still never been observed rendering from a failed image.** The
  pre-hydration check (`complete && naturalWidth === 0`) and the `onError` path are both reasoned
  and unit-unreachable; every logo on the verified pages loaded. Carried, unchanged, from the
  14:18 round.
- No screenshot of states A–I individually; the table is read from the DOM, which is the stronger
  artifact for text assertions but does not prove layout for each state. The one screenshot taken
  is the Hebrew filtered state.
