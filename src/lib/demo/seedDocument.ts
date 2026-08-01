import type { Dictionary } from '@/lib/i18n/dictionaries/en'

// The working document's seed content, kept OUT of the component so it can be
// unit-tested without React.
//
// This content is FABRICATED — invented financials for a real TASE issuer, and a
// quote attributed to a NAMED executive of that issuer. It is the most dangerous
// element in the Projects/Workspace/Agents import, and it has now cost two review
// rounds, so the invariants below are asserted by seedDocument.test.ts rather than
// left to a reader's care:
//
//   1. The <cite> carries a marker built FROM THE DICTIONARY, so it can never be
//      English-only again (round-1 defect: a Hebrew reader saw no marker at all on
//      the one element most likely to be mistaken for sourced fact).
//   2. That marker sits INSIDE the blockquote, so it travels with the quote through
//      paths the app does not control — a browser Ctrl+P, a copy-paste elsewhere.
//      (Round-2 defect: the only marker lived at the top of a scrolling pane, and a
//      real Chromium page.pdf() produced the quote with no marker whatsoever.)
//
// The non-deletable notice rendered outside `contentEditable` in WorkingDocument is
// the OTHER half and is not a substitute: it covers the screen, this covers the trip.

export function seedHtml(dict: Dictionary): string {
  const mark = `${dict.demo.inlineLabel}: ${dict.demo.inlineHint}`
  return `
<p>Tigbur runs the ninth-largest shipping operation in the world and roughly <b>40%</b> of Israeli container throughput. The privatization tender closes in September, and the questions that decide the price are less about the fleet than about who is allowed to own it.</p>
<h2>What the filings actually say</h2>
<p>Revenue climbed every year from <b>₪1.21B</b> (2022) to <b>₪1.56B</b> (2025) — an 8.3% CAGR — while operating margin only reached 3.7%. Growth is real; it is not yet profitable growth.</p>
<blockquote data-citation="1">
  <p dir="rtl">אנחנו מעלים את תחזית ההכנסות לשנה כולה לטווח של 1.5 עד 1.6 מיליארד שקל.</p>
  <cite dir="auto">מוטי בן־ארי · CEO · Q2 2026 call · Q2 2026 deck.pdf — ${mark}</cite>
</blockquote>
<h2>Open questions</h2>
<ul>
  <li>Does the Haifa concession survive a change of control?</li>
  <li>How much of the 2023 restatement is recurring?</li>
  <li>Which sovereign funds sit behind the leading bidder?</li>
</ul>
`.trim()
}
