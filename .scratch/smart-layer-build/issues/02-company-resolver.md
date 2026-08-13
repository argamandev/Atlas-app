# A2 · Company resolver + alias table

Status: done (2026-08-13 — `feat/smart-layer-a2-company-resolver`; 246 aliases seeded in
production, `resolveCompany()` + `buildAliasSeed()` unit-tested, the בז"א MUST-PASS green
offline; see PROGRESS.md)
Blocked by: 01

Spec §6 A2 + §2.2 (`resolve_company`). Seed `company_aliases` (registered names, common
abbreviations, tickers, Latin forms — בז"א included), build `resolveCompany()` + unit
tests. Acceptance: the בז"א MUST-PASS eval case green offline; unknown names return null
honestly. Cost: $0.
