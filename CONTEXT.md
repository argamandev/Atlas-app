# Atlas — Context

The project's shared vocabulary. Glossary only: no procedures, no implementation
detail, no status. If a term here conflicts with how a document or a session is
using a word, this file wins and the other one gets corrected.

## Working shape

### Worktree

A checkout of the repo on disk (`git worktree`). Isolation, nothing more.
Created when two pieces of work must not touch each other's files; removed when
that work lands. A worktree holds no state of its own and outlives nothing.

### Session

One running Claude window, working one mission at a time. A session's context is
disposable by design — everything it needs to know arrives from the repo, never
from another session.

### Mission

What is being attempted, written down before work starts and small enough that
one session can hold it. A mission ends when it merges.

> **Superseded: "lane."** The old word meant a worktree, a branch, a mission and a
> running session at once. Two fully-merged worktrees passed as live work for
> months because the vocabulary could not tell an empty directory from an active
> effort. Split, never reintroduced.

## Memory

### Law

A rule that constrains how Atlas is built, stated so an agent can obey it without
knowing its history. Always-on. Every law is either enforced by a mechanism or
explicitly marked as not enforced.

### Mechanism

The thing that makes a law hold without anyone remembering it — in descending
order of strength: **impossible** (the mistake cannot be expressed), **test**,
**hook or grep**, **ritual gate** (a fixed checklist item that fires every time),
**prose**. Prose is the weakest tier and is not counted as enforcement. A law with
no mechanism says so, in the law, with a reason.

### Fact

Reference knowledge about how something outside Atlas behaves — MAYA requires
`Accept-Language: he-IL`; Recall's captions lag 72–203s. A fact cannot be violated,
only misunderstood, so it is never enforced and never always-on. Facts are loaded
when the code they describe is being touched. Mixing facts into the always-on set is
the main way that set grows without anyone deciding to grow it.

### Recurrence

The same defect happening twice. Recurrence is the signal that a law's mechanism is
too weak, never that the law needs restating — a law filed at the same tier twice has
proven that tier does not hold it.

### History

The record of how a law was learned — the defect, the rounds, the evidence.
Valuable, on demand, never always-on. History is what a law is asked to justify
itself with when it is challenged; it is not what an agent reads to obey it.

### Eviction

The rule by which something stops being always-on. Atlas evicts at **merge**: when
work lands, its working notes become history in the same motion. Nothing in the
always-on set is append-only.

### Collision

The narrow set of things two simultaneous sessions can genuinely break for each
other: a database migration (Supabase is Atlas production), a shared
type, a design token. Collisions are the only thing sessions coordinate on. Everything
else they coordinate through `main`.
