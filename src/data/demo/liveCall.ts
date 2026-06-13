// Metadata for the seeded DEMO live call that powers the crown-jewel Live Transcript
// page (brief §5.5). The transcript words + audio come from the real Recall spike
// (scripts/fixtures/recall-spike.transcript.json + scripts/out/bakeoff-audio.mp3),
// surfaced here as a live call for תיגבור so the karaoke flow is demoable end-to-end.
export const DEMO_LIVE_CALL = {
  id: 'demo',
  href: '/app/live/demo',
  companyTicker: '1105022', // תיגבור — resolved to a real company id when saving quotes
  companyName: 'תיגבור',
  companyNameEn: 'Tigbur Group',
  logoUrl: '/logos/tigbur.jpg',
  quarter: 'Q2 2026',
  date: '2026-06-19T08:00:00+00:00',
  live: true,
}
