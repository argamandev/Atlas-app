# A2 · Company resolver + alias table

Status: ready-for-agent
Blocked by: 01

Spec §6 A2 + §2.2 (`resolve_company`). Seed `company_aliases` (registered names, common
abbreviations, tickers, Latin forms — בז"א included), build `resolveCompany()` + unit
tests. Acceptance: the בז"א MUST-PASS eval case green offline; unknown names return null
honestly. Cost: $0.
