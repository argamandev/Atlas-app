---
status: accepted
date: 2026-08-12
---

# A lesson is not learned until a mechanism enforces it

Atlas recorded its defects diligently — some lessons were filed four times across four
documents — and the defects recurred anyway, up to a 7th occurrence. Sorting the laws
in `.claude/rules/app.md` by whether they carry an enforcement mechanism explains why:
the laws marked `ENFORCED` by a test (API auth, timezone formatting) stopped recurring,
and the laws marked `ENFORCED none` (bidi, visible degradation, `supabaseAdmin` and RLS)
are exactly the ones that kept coming back. Prose is read optionally; a failing test is
not. **Therefore a defect that recurs must gain a mechanism one tier stronger, or be
explicitly marked `UNENFORCEABLE` with a stated reason — and the mechanism ships in the
same commit as the fix, gated at review.**

The tiers, strongest first: **impossible** (the mistake cannot be expressed — types, a
single choke point, unrepresentable states) → **test** → **hook or grep** → **ritual
gate** (a fixed checklist item that fires every time) → **prose**.

## Consequences

The escape hatch is mandatory, not a weakness. Without it, a hard gate pressures people
into writing fake mechanisms, and a law that merely *looks* enforced is worse than one
honestly marked unenforced — the same failure this repo already filed under "a test that
asserts the defect defends it."

The system's health is one command: `npm run env:health`. It reports the count of laws
declaring no working mechanism — `ENFORCED none` **and** `ENFORCED partially`, because a
law enforced for one surface is unenforced for every other one, which is precisely what
`app.md` says about bidi, the repo's most-repeated defect. (This ADR first specified
`grep -c "ENFORCED none"`; that undercounts, and it could not see a law that declared
nothing at all. `src/lib/environment.test.ts` now fails the battery for a bare law, so
every law is in the count or is a build failure.) That number trending down is what
"self-improving" means here — not that the lessons get better written, but that the
system can see whether the last one worked.
