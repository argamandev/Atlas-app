'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { DemoInline } from '@/components/ds/DemoBanner'
import { CheckIcon, ChevronRightIcon } from '@/components/ds/icons'
import { LEGAL_AREAS, LEGAL_FINDINGS, LEGAL_SEVERITY_STYLE, LEGAL_STEPS } from '@/lib/workspace/data'

// Legal Due-Diligence (design lines 1489-1545): the panel row expands into
// scoping (1509) then running (1527); findings open as the __legal tab.
//
// Steps advance on USER action, never on a timer — nothing is actually running,
// and a fake progress animation would be a lie about work being done.

export type LegalStage = 'idle' | 'scoping' | 'running' | 'done'

export function LegalPanelRow({
  stage,
  step,
  areas,
  onToggleArea,
  onOpenScoping,
  onCancel,
  onRun,
  onAdvance,
  onOpenFindings,
}: {
  stage: LegalStage
  step: number
  areas: string[]
  onToggleArea: (a: string) => void
  onOpenScoping: () => void
  onCancel: () => void
  onRun: () => void
  onAdvance: () => void
  onOpenFindings: () => void
}) {
  const { dict } = useI18n()

  const sub =
    stage === 'done'
      ? dict.workspace.legalDoneSub.replace('{n}', String(LEGAL_FINDINGS.length))
      : stage === 'running'
        ? dict.workspace.legalRunning
        : dict.workspace.legalSub

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-hairline bg-paper">
      <button
        type="button"
        onClick={stage === 'done' ? onOpenFindings : stage === 'idle' ? onOpenScoping : undefined}
        className="flex w-full items-center gap-[11px] px-3 py-[11px] text-start"
      >
        <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg border border-hairline bg-canvas text-ink">
          <ShieldGlyph spinning={stage === 'running'} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold text-ink">{dict.workspace.legalTitle}</span>
          <span className="truncate text-[11px] text-ink-ghost">{sub}</span>
        </span>
        {stage === 'done' && (
          <ChevronRightIcon size={14} strokeWidth={1.8} className="flex-none text-ink-ghost rtl:rotate-180" />
        )}
      </button>

      {stage === 'scoping' && (
        <div className="px-3 pb-3">
          <div className="mb-[11px] h-px bg-hairline" />
          <div className="mb-[9px] text-[11.5px] leading-[1.5] text-ink-muted">
            {dict.workspace.legalScopePrompt}
          </div>
          <div className="mb-[9px] flex flex-wrap gap-1.5">
            {LEGAL_AREAS.map((a) => {
              const on = areas.includes(a)
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => onToggleArea(a)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    on
                      ? 'border-ink bg-ink text-paper'
                      : 'border-hairline bg-canvas text-ink-muted hover:bg-subtle'
                  }`}
                >
                  {a}
                </button>
              )
            })}
          </div>
          <textarea
            placeholder={dict.workspace.legalScopePlaceholder}
            className="min-h-[64px] w-full resize-y rounded-[9px] border border-hairline bg-canvas px-2.5 py-[9px] text-[12px] leading-[1.55] text-ink outline-none placeholder:text-ink-ghost"
          />
          <div className="mt-[9px] flex items-center justify-end gap-[7px]">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium text-ink-muted hover:bg-subtle"
            >
              {dict.common.cancel}
            </button>
            <button
              type="button"
              onClick={onRun}
              className="rounded-lg bg-ink px-3 py-1.5 text-[12px] font-semibold text-paper"
            >
              {dict.workspace.legalRun}
            </button>
          </div>
        </div>
      )}

      {stage === 'running' && (
        <div className="px-3 pb-3">
          <div className="mb-[11px] h-px bg-hairline" />
          <div className="flex flex-col gap-2">
            {LEGAL_STEPS.map((t, i) => {
              const done = i < step
              const running = i === step
              return (
                <div
                  key={t}
                  className={`flex items-center gap-2 text-[11.5px] leading-[1.4] ${
                    done ? 'text-ink-muted' : running ? 'text-ink' : 'text-ink-ghost'
                  }`}
                >
                  <span className="flex h-[13px] w-[13px] flex-none items-center justify-center">
                    {done ? (
                      <CheckIcon size={13} strokeWidth={2.4} className="text-[#4F7A52]" />
                    ) : running ? (
                      <span className="h-[9px] w-[9px] animate-spin rounded-full border-2 border-ink border-t-transparent" />
                    ) : (
                      <span className="h-[5px] w-[5px] rounded-full bg-hairline" />
                    )}
                  </span>
                  {t}
                </div>
              )
            })}
          </div>
          <button
            type="button"
            onClick={onAdvance}
            className="mt-2.5 w-full rounded-lg border border-hairline bg-canvas py-1.5 text-[11.5px] font-medium text-ink-muted hover:bg-subtle"
          >
            {step < LEGAL_STEPS.length - 1 ? '→' : '✓'}{' '}
            {step < LEGAL_STEPS.length - 1
              ? LEGAL_STEPS[step + 1]
              : dict.workspace.legalDoneSub.replace('{n}', String(LEGAL_FINDINGS.length))}
          </button>
        </div>
      )}
    </div>
  )
}

/** The findings, rendered as the __legal tab (design 1888-1933). */
export function LegalAgentChat({ areas }: { areas: string[] }) {
  const { dict } = useI18n()
  const scopeLine = areas.length
    ? dict.workspace.legalScopeLine.replace('{areas}', areas.join(' · '))
    : dict.workspace.legalFullReview

  return (
    <div className="atscroll h-full min-h-0 overflow-auto bg-canvas px-8 py-7">
      <div className="mx-auto flex max-w-[720px] flex-col gap-4">
        <div>
          <h2 className="font-display text-[24px] font-medium tracking-[-0.018em] text-ink">
            {dict.workspace.legalTitle}
          </h2>
          <div className="mt-1 text-[12.5px] text-ink-ghost">{scopeLine}</div>
        </div>
        <div className="flex flex-col gap-2.5">
          {LEGAL_FINDINGS.map((f) => {
            const s = LEGAL_SEVERITY_STYLE[f.k]
            return (
              <div key={f.src} className="rounded-xl border border-hairline bg-paper px-3.5 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="rounded-[5px] px-1.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: s.color, background: s.background }}
                  >
                    {f.sev}
                  </span>
                  {/* a finding is invented content wearing citation clothes */}
                  <DemoInline />
                </div>
                <div dir="auto" className="text-[13px] leading-[1.6] text-ink">
                  {f.text}
                </div>
                <div dir="auto" className="mt-1.5 font-mono-num text-[11px] text-ink-ghost">
                  {f.src}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ShieldGlyph({ spinning }: { spinning: boolean }) {
  if (spinning) {
    return (
      <span className="h-[15px] w-[15px] animate-spin rounded-full border-2 border-ink border-t-transparent" />
    )
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l7.5 3v5.6c0 4.4-3.1 7.9-7.5 8.9-4.4-1-7.5-4.5-7.5-8.9V6z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </svg>
  )
}
