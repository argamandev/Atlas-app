# B2 · Ask Atlas surfaces

Status: ready-for-agent
Blocked by: 07

Spec §2.3 + §6 B2. `TranscriptChatPanel` (live calls, transcripts, multiview) +
company-page chat onto the new backend: whole-call injection (6–18K), company scoping via
tools; retire the old `/api/chat` wire format (both callers updated in the same change).
Acceptance: `/verify-app` on live-call, transcript and company surfaces, both locales.
Cost: ≤ $0.06/answer; stuffed first turn ≤ $0.13.
