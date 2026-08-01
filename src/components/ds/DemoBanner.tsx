'use client'

import { useI18n } from '@/lib/i18n/LocaleProvider'

// ─────────────────────────────────────────────────────────────────────────────
// The demo marker for stub-fed surfaces.
//
// WHY THIS EXISTS: rendering fabricated content as real is a REPEATED, filed
// defect class in this repo (.claude/rules/app.md — "degradation must be
// VISIBLE"). Projects, Workspace and Agents are stub-fed this chapter, and the
// design populates them with invented financials for REAL TASE issuers plus a
// Hebrew quote dressed as a sourced citation from a named executive. The rule
// this component enforces:
//
//   If a screen shows a number, a quote, or a finding that no backend produced,
//   that screen carries a visible marker — in Hebrew AND English.
//
// DemoBanner = the page-level bar. DemoInline = the per-element chip, used on
// citation blocks and severity findings, which are the two elements that most
// look like sourced fact.
//
// Colours are the design's own caution pair (LEGAL_SEVERITY_STYLE.medium,
// design line 3652) so the marker reads as part of the system, not bolted on.
// ─────────────────────────────────────────────────────────────────────────────

const CAUTION_INK = '#8A6A2F'
const CAUTION_WASH = 'rgba(180,140,60,.13)'

/** Page-level marker. Render at the top of any stub-fed surface. */
export function DemoBanner({ className = '' }: { className?: string }) {
  const { dict } = useI18n()
  return (
    <div
      role="note"
      className={`flex items-start gap-2.5 border-b border-hairline px-6 py-2.5 text-[12.5px] leading-[1.5] ${className}`}
      style={{ background: CAUTION_WASH, color: CAUTION_INK }}
    >
      <span aria-hidden className="mt-px flex-none text-[13px] leading-none">
        ⚠
      </span>
      <span>
        <strong className="font-semibold">{dict.demo.bannerTitle}</strong>
        <span className="mx-1.5" aria-hidden>
          ·
        </span>
        {dict.demo.bannerBody}
      </span>
    </div>
  )
}

/**
 * Element-level marker. Put it on anything that wears the costume of sourced
 * fact — citation blocks, agent findings, legal findings.
 */
export function DemoInline({ className = '' }: { className?: string }) {
  const { dict } = useI18n()
  return (
    <span
      title={dict.demo.inlineHint}
      className={`inline-flex flex-none items-center rounded-[3px] px-1.5 py-px align-middle text-[9.5px] font-semibold uppercase tracking-[0.1em] ${className}`}
      style={{ background: CAUTION_WASH, color: CAUTION_INK }}
    >
      {dict.demo.inlineLabel}
    </span>
  )
}
