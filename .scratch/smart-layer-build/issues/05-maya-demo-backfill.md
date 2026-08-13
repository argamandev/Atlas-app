# A5 · MAYA demo backfill + freshness

Status: ready-for-agent
Blocked by: 04

Spec §2.7 + §6 A5 (ticket 17's decisions). "Latest of each" per company (latest
quarterly + latest annual + 12 months of presentations, 234 companies, ≈55–70K pages);
detection by event ids 101/104/105/106, never `.xbrl` presence; ~10-minute
latest-disclosures poller + nightly per-company sweep, both through the birth sequence.
Acceptance: a fresh filing searchable ≤ ~15 min after publication; `index_status`
visible in admin. Cost: $5–8 one-time, ~$1–7/mo.
