'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { PillComposer } from '@/components/ds/PillComposer'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { ChevronLeftIcon, PlusIcon, AtIcon, ArrowUpIcon, CheckIcon } from '@/components/ds/icons'
import { intakeSearchReq, addItemReq } from '@/lib/workspace/client'
import type { FindResult } from '@/lib/workspace/intake/types'
import type { AttachableSource } from '@/lib/workspace/data'

// The workspace intake (design lines 1339-1429) — what an EMPTY workspace shows.
//
// THIS PANEL IS THE FRONT DOOR, and it was unrouted for a day because nothing
// backed it. It is backed now: `POST /api/workspaces/[id]/intake` interprets the
// sentence and searches the REAL corpus, and every row below is a row that
// exists. Nothing here is fabricated, which is why the demo banner is gone.
//
// One addition to the imported design, and it is the founder's (D5, 2026-08-04):
// a confirm list inside the clarify conversation. The design went
// intro -> clarify -> building with no chance to see what was coming. Nothing
// lands on the shelf that the user did not look at.

type Stage = 'intro' | 'searching' | 'clarify' | 'building'

export function WorkspaceIntake({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string
  workspaceName: string
}) {
  const { dict } = useI18n()
  const router = useRouter()

  const [stage, setStage] = useState<Stage>('intro')
  const [request, setRequest] = useState('')
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState<FindResult | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [searchError, setSearchError] = useState<unknown>(null)
  const [failures, setFailures] = useState<{ title: string; error: string }[]>([])

  /** Everything this result put in front of the user — matched, or offered instead. */
  const offered: AttachableSource[] = result
    ? result.matched.length > 0
      ? result.matched
      : result.otherForCompany
    : []

  async function send(text: string) {
    const q = text.trim()
    if (!q) return
    setRequest(q)
    setDraft('')
    setSearchError(null)
    setStage('searching')
    try {
      const { result: r } = await intakeSearchReq(workspaceId, q)
      setResult(r)
      // Matches are preselected — the user trims. What is merely OFFERED after a
      // miss is NOT: they asked for a period we do not have, so silently ticking
      // a different period would put files on the shelf they never asked for.
      setChosen(new Set(r.matched.map((m) => m.sourceId)))
      setStage('clarify')
    } catch (e: unknown) {
      // Back to intro, never to a clarify screen over a failed search — an empty
      // list rendered after a 500 reads as "Atlas has nothing", which is a lie.
      setSearchError(e)
      setStage('intro')
    }
  }

  function toggle(sourceId: string) {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  async function build() {
    const picked = offered.filter((s) => chosen.has(s.sourceId))
    if (picked.length === 0) return
    setStage('building')
    setFailures([])

    const failed: { title: string; error: string }[] = []
    // Sequential on purpose: `position` is assigned server-side per insert, so
    // firing these in parallel would land the shelf in a different order from
    // the list the user just approved.
    for (const s of picked) {
      try {
        await addItemReq(workspaceId, {
          kind: s.kind,
          name: s.title,
          ...(s.kind === 'transcript' ? { transcript_id: s.sourceId } : { document_id: s.sourceId }),
        })
      } catch (e: unknown) {
        failed.push({ title: s.title, error: (e as Error).message })
      }
    }

    if (failed.length > 0) {
      // A PARTIAL FILL MUST BE VISIBLE. Refreshing here would drop the user into
      // a workspace holding 3 of the 5 files they approved, with nothing on
      // screen having said so.
      setFailures(failed)
      return
    }
    // The route is a Server Component; this is what re-reads the shelf and lands
    // the user in the populated WorkspaceShell.
    router.refresh()
  }

  // The bottom bar exists ONLY once the conversation has started. At the intro
  // stage the big centred composer is the whole point of the screen, and a
  // second bar underneath it was the founder's "two text panels" complaint
  // (2026-08-01) — the design shows one composer at a time, never both.
  const composer = (
    <div className="px-8 pb-[26px]">
      <div className="mx-auto w-full max-w-[720px]">
        <PillComposer
          value={draft}
          onChange={setDraft}
          onSend={() => void send(draft)}
          placeholder={dict.workspace.intakePlaceholder}
          sendLabel={dict.workspace.intakeSend}
          addLabel={dict.workspace.intakeAdd}
          micLabel={dict.workspace.intakeMic}
        />
      </div>
    </div>
  )

  /**
   * One offered source. Every mixed run gets its own <bdi> — the title is often
   * Hebrew, the date is always Latin digits, and the company can be either. A
   * single dir on this row would throw one of them to the wrong side, which is
   * the defect .claude/rules/app.md has filed four times.
   */
  const row = (s: AttachableSource) => (
    <label
      key={s.sourceId}
      className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border border-hairline bg-paper px-3 py-2.5 transition-colors hover:bg-subtle/60"
    >
      <input
        type="checkbox"
        checked={chosen.has(s.sourceId)}
        onChange={() => toggle(s.sourceId)}
        className="mt-[3px] h-[15px] w-[15px] flex-none accent-ink"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-ink">
          <bdi>{s.title}</bdi>
        </span>
        <span className="truncate text-[11.5px] text-ink-ghost">
          {s.company && <bdi>{s.company}</bdi>}
          {s.company && s.when && ' · '}
          {s.when && (
            <bdi dir="ltr" className="font-mono-num">
              {s.when.slice(0, 10)}
            </bdi>
          )}
        </span>
      </span>
    </label>
  )

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-canvas">
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
              {searchError !== null && (
                <div
                  role="alert"
                  className="mb-4 w-full rounded-[10px] border border-hairline bg-paper px-3.5 py-2.5 text-start text-[13px] text-ink"
                >
                  <ErrorLine
                    template={dict.workspace.intakeSearchFailed}
                    error={searchError}
                    auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
                  />
                </div>
              )}
              <div className="w-full rounded-2xl border border-hairline bg-paper px-4 py-3.5 shadow-soft">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void send(draft)}
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
                    onClick={() => void send(draft)}
                    aria-label={dict.workspace.intakeSend}
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

        {stage === 'searching' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10">
            <div dir="auto" className="font-display text-[17px] text-ink-muted">
              {dict.workspace.intakeSearching}
            </div>
            <div dir="auto" className="max-w-[520px] text-center text-[12.5px] text-ink-ghost">
              <bdi>{request}</bdi>
            </div>
          </div>
        )}

        {stage === 'clarify' && result && (
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-8 pb-6 pt-[34px]">
            <div
              dir="auto"
              className="max-w-[80%] self-end rounded-[14px_14px_4px_14px] bg-ink px-[15px] py-[11px] text-[14px] leading-[1.6] text-paper"
            >
              {request}
            </div>

            <div className="max-w-[98%] self-start text-[14.5px] leading-[1.7] text-ink">
              {/* The four outcomes, each said in its own words. An empty list is
                  never allowed to stand in for "I could not find it" — that
                  substitution is what made the shipped version dishonest. */}
              {result.reason === 'ok' && (
                <div dir="auto">
                  {dict.workspace.intakeFound.replace('{n}', String(result.matched.length))}
                </div>
              )}
              {result.reason === 'company-has-nothing-in-period' && (
                <div dir="auto">
                  {dict.workspace.intakeNothingInPeriod.split('{company}')[0]}
                  <bdi>{result.company}</bdi>
                  {dict.workspace.intakeNothingInPeriod.split('{company}')[1]}
                </div>
              )}
              {result.reason === 'nothing-matched' && (
                <div dir="auto">
                  {dict.workspace.intakeNoMatch}
                  <div className="mt-1.5 text-[12.5px] text-ink-ghost">{dict.workspace.intakeRephrase}</div>
                </div>
              )}
              {result.reason === 'empty-corpus' && <div dir="auto">{dict.workspace.intakeEmptyCorpus}</div>}

              {/* Said out loud rather than hidden: these are word matches, not an
                  understood request. The user is entitled to know which they got. */}
              {!result.request.interpreted && offered.length > 0 && (
                <div
                  dir="auto"
                  className="mt-2.5 rounded-lg bg-subtle px-2.5 py-2 text-[12px] leading-[1.5] text-ink-muted"
                >
                  {dict.workspace.intakeNotInterpreted}
                </div>
              )}

              {offered.length > 0 && (
                <>
                  <div className="mt-4 flex flex-col gap-1.5">{offered.map(row)}</div>
                  <div className="mt-[22px] flex flex-wrap items-center gap-3.5">
                    <button
                      type="button"
                      onClick={() => void build()}
                      disabled={chosen.size === 0}
                      className="flex items-center gap-2 rounded-full bg-ink px-[18px] py-[9px] text-[13px] font-medium text-paper disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <CheckIcon size={14} strokeWidth={2} />
                      {dict.workspace.buildWithCount.replace('{n}', String(chosen.size))}
                    </button>
                    <span className="text-[12.5px] text-ink-ghost">{dict.workspace.orKeepDescribing}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {stage === 'building' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10">
            {failures.length === 0 ? (
              <div dir="auto" className="font-display text-[17px] text-ink-muted">
                {dict.workspace.intakeAdding}
              </div>
            ) : (
              <div className="flex w-[min(560px,94%)] flex-col items-center gap-3">
                <div
                  role="alert"
                  dir="auto"
                  className="w-full rounded-[10px] border border-hairline bg-paper px-3.5 py-2.5 text-start text-[13px] text-ink"
                >
                  {dict.workspace.intakeAttachFailed
                    .replace('{n}', String(failures.length))
                    .replace('{error}', failures[0].error)}
                  <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-ink-ghost">
                    {failures.map((f) => (
                      <li key={f.title}>
                        <bdi>{f.title}</bdi>
                      </li>
                    ))}
                  </ul>
                </div>
                {/* The ones that DID land are already on the shelf, so the way
                    forward is into the workspace, not a retry that would
                    duplicate them. */}
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-paper"
                >
                  {dict.workspace.intakeContinueAnyway}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {stage === 'clarify' && composer}
    </div>
  )
}
