'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { DemoBanner, DemoInline } from '@/components/ds/DemoBanner'
import { ChevronLeftIcon, PlusIcon, AtIcon, ArrowUpIcon, CheckIcon } from '@/components/ds/icons'

// Workspace intake (design lines 1339-1429) — what an EMPTY workspace shows:
// intro (1356) → clarify loop (1376) → building (1408), with the composer (1420).
//
// Stages advance on user action only. There is no timer faking progress and no
// backend gathering anything, so the building stage says so out loud rather than
// pretending work is happening (rules/app.md — degradation must be VISIBLE).

type Stage = 'intro' | 'clarify' | 'building'
const PERIODS = ['2022–2025', 'Last 2 years', 'Just latest'] as const

export function WorkspaceIntake({ workspaceName }: { workspaceName: string }) {
  const { dict } = useI18n()
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('intro')
  const [request, setRequest] = useState('')
  const [draft, setDraft] = useState('')
  const [period, setPeriod] = useState<string>(PERIODS[0])
  const [deck, setDeck] = useState(true)
  const [report, setReport] = useState(true)

  function send() {
    const text = draft.trim()
    if (!text) return
    setRequest(text)
    setDraft('')
    setStage('clarify')
  }

  const chip = (on: boolean) =>
    `rounded-full border px-[13px] py-1.5 text-[12.5px] transition-colors ${
      on ? 'border-ink bg-ink text-paper' : 'border-hairline bg-transparent text-ink-muted hover:bg-subtle'
    }`

  const composer = (
    <div className="px-8 pb-[26px]">
      <div className="mx-auto flex max-w-[720px] items-center gap-3 rounded-[14px] border border-hairline bg-paper px-3.5 py-3 shadow-soft">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={dict.workspace.intakePlaceholder}
          className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-ghost"
        />
        <span className="text-ink-ghost" aria-hidden>
          @
        </span>
        <span className="text-ink-ghost" aria-hidden>
          /
        </span>
        <button
          type="button"
          onClick={send}
          aria-label={dict.workspace.intakePlaceholder}
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-ink text-paper"
        >
          <ArrowUpIcon size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-canvas">
      <DemoBanner />
      <div className="flex flex-none items-center justify-between gap-3 border-b border-hairline px-[22px] py-3.5">
        <button
          type="button"
          onClick={() => router.push('/app/workspace')}
          className="flex items-center gap-1.5 text-[12px] text-ink-faint hover:text-ink"
        >
          <ChevronLeftIcon size={14} strokeWidth={1.7} className="rtl:rotate-180" />
          {dict.workspace.backToWorkspaces}
        </button>
        <span dir="auto" className="truncate text-[12px] text-ink-ghost">
          {workspaceName}
        </span>
      </div>

      <div className="atscroll flex min-h-0 flex-1 flex-col overflow-auto">
        {stage === 'intro' && (
          <div className="flex flex-1 flex-col items-center justify-center px-10 py-12">
            <div className="flex w-full max-w-[600px] flex-col items-center">
              <h1 className="mb-2 text-center font-display text-[34px] font-medium tracking-[-0.02em] text-ink">
                {dict.workspace.intakeHead}
              </h1>
              <p className="mb-[26px] max-w-[460px] text-center text-[15px] leading-[1.55] text-ink-muted">
                {dict.workspace.intakeSub}
              </p>
              <div className="w-full rounded-2xl border border-hairline bg-paper px-4 py-3.5 shadow-soft">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                  placeholder={dict.workspace.intakePlaceholder}
                  className="mb-3.5 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-ghost"
                />
                <div className="flex items-center gap-3.5 text-ink-ghost">
                  <PlusIcon size={18} strokeWidth={1.7} />
                  <AtIcon size={16} strokeWidth={1.7} />
                  <span className="rounded-[5px] border border-hairline px-1.5 text-[14px] leading-[1.4]">
                    /
                  </span>
                  <button
                    type="button"
                    onClick={send}
                    aria-label={dict.workspace.intakePlaceholder}
                    className="ms-auto flex h-[30px] w-[30px] items-center justify-center rounded-full bg-ink text-paper"
                  >
                    <ArrowUpIcon size={15} strokeWidth={2} />
                  </button>
                </div>
              </div>
              <div className="mt-3 text-[12px] text-ink-ghost">{dict.workspace.intakeHint}</div>
            </div>
          </div>
        )}

        {stage === 'clarify' && (
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-8 pb-6 pt-[34px]">
            <div
              dir="auto"
              className="max-w-[80%] self-end rounded-[14px_14px_4px_14px] bg-ink px-[15px] py-[11px] text-[14px] leading-[1.6] text-paper"
            >
              {request}
            </div>
            <div className="max-w-[98%] self-start text-[14.5px] leading-[1.7] text-ink">
              {dict.workspace.clarifyLead}
              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-ghost">
                  {dict.workspace.clarifyPeriod}
                </div>
                <div className="mt-[9px] flex flex-wrap gap-2">
                  {PERIODS.map((p) => (
                    <button key={p} type="button" onClick={() => setPeriod(p)} className={chip(period === p)}>
                      <bdi dir="ltr">{p}</bdi>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-ghost">
                  {dict.workspace.clarifyElse}
                </div>
                <div className="mt-[9px] flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDeck((d) => !d)}
                    className={`${chip(deck)} inline-flex items-center gap-[7px]`}
                  >
                    <CheckIcon size={13} strokeWidth={2} />
                    {dict.workspace.clarifyDeck}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReport((r) => !r)}
                    className={`${chip(report)} inline-flex items-center gap-[7px]`}
                  >
                    <CheckIcon size={13} strokeWidth={2} />
                    {dict.workspace.clarifyReport}
                  </button>
                </div>
              </div>
              <div className="mt-[22px] flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => setStage('building')}
                  className="flex items-center gap-2 rounded-full bg-ink px-[18px] py-[9px] text-[13px] font-medium text-paper"
                >
                  <CheckIcon size={14} strokeWidth={2} />
                  {dict.workspace.approveBuild}
                </button>
                <span className="text-[12.5px] text-ink-ghost">{dict.workspace.orKeepDescribing}</span>
              </div>
            </div>
          </div>
        )}

        {stage === 'building' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-10">
            <div className="w-[min(560px,94%)] text-center">
              <div className="font-display text-[17px] text-ink-muted">{dict.workspace.buildingTitle}</div>
            </div>
            <div dir="ltr" className="mt-2 font-mono-num text-[12.5px] tracking-[0.04em] text-ink-ghost">
              {dict.workspace.buildingSteps}
            </div>
            <div className="mt-4 flex items-center gap-2 text-[12.5px] text-ink-muted">
              <DemoInline />
              {dict.workspace.buildingDemoNote}
            </div>
          </div>
        )}
      </div>

      {stage !== 'building' && composer}
    </div>
  )
}
