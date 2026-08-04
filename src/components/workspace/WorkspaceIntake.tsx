'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { PillComposer } from '@/components/ds/PillComposer'
import { Typewriter } from '@/components/ds/Typewriter'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { ChevronLeftIcon, PlusIcon, AtIcon, ArrowUpIcon } from '@/components/ds/icons'
import { intakeSearchReq, addItemReq } from '@/lib/workspace/client'
import type { IntakeTurn } from '@/lib/workspace/intake/types'
import type { AttachableSource } from '@/lib/workspace/data'

// The workspace intake (design lines 1339-1429) — what an EMPTY workspace shows.
//
// IT IS A CONVERSATION, not a form. Founder, 2026-08-04, after using the first
// version: *"when a user sends a message about what he wants, Atlas is just
// turning into a weird loading screen… he needs to keep the same chat interface,
// but only ask him back, okay, so just to clarify, you want this, this and this.
// without the checkmarking, without the boxes. Just like him replying in words…
// and once the user says, yeah, pull those files, then only then Atlas goes,
// okay, I'm pulling them."*
//
// So: the thread stays on screen the whole time, Atlas answers in prose, and
// NOTHING is attached until the model reports `status: 'ready'`, which it may
// only do because the user agreed in their own words. The previous version took
// over the screen with a spinner and then presented a grid of tickboxes — a form
// wearing a chat's clothes.

type Stage = 'intro' | 'chat' | 'pulling'

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
  const [turns, setTurns] = useState<IntakeTurn[]>([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [failures, setFailures] = useState<{ title: string; error: string }[]>([])
  /** index of the one turn currently revealing itself, or null */
  const [animateAt, setAnimateAt] = useState<number | null>(null)

  const endRef = useRef<HTMLDivElement>(null)
  const stickToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [])
  useEffect(() => {
    stickToEnd()
  }, [turns, thinking, stickToEnd])

  async function send(text: string) {
    const q = text.trim()
    if (!q || thinking) return

    const next: IntakeTurn[] = [...turns, { role: 'user', content: q }]
    setTurns(next)
    setDraft('')
    setError(null)
    setStage('chat')
    setThinking(true)

    try {
      const { result } = await intakeSearchReq(workspaceId, next)
      setThinking(false)

      const ready = result.status === 'ready' && result.selected.length > 0

      // ATLAS ALWAYS SAYS SOMETHING BACK — there is no turn where the user
      // speaks and nothing answers.
      //
      // This reverses a decision made yesterday and refused today. `reply: null`
      // with `ready` was treated as a deliberate silence: the user had said
      // "yes", so the server spent no model call composing a sentence, and the
      // pulling dots were left to be the whole reply. Founder, 2026-08-04:
      // *"more human. if the user says yes pull them -> he should respond
      // 'great, im pulling them it can take a second…'"*. He is right, and the
      // reasoning was wrong in a specific way: a progress indicator is the
      // MACHINE acknowledging, and the thing being built here is a colleague
      // answering. The sentence is written here rather than asked for, so it
      // still costs nothing and still arrives instantly.
      const spoken =
        result.reply !== null
          ? result.reply
          : ready
            ? dict.workspace.intakePullingNow
            : dict.workspace.intakeNotInterpreted

      // THE PROPOSED SET RIDES WITH THE SENTENCE. Atlas names files in prose;
      // these are the same files as ids, so the next turn can act on what was
      // agreed instead of asking a model to re-read its own words. Founder,
      // 2026-08-04: he said yes to two files and one arrived.
      const said: IntakeTurn = {
        role: 'assistant',
        content: spoken,
        ...(result.selected.length > 0 ? { proposed: result.selected.map((s) => s.sourceId) } : {}),
      }
      setTurns([...next, said])
      // Only THIS turn animates. Re-running the reveal over the whole thread on
      // every render would replay the conversation from the top each time.
      setAnimateAt(next.length)

      // THE ONLY PATH THAT TOUCHES THE SHELF, and it needs the user's own yes.
      // Not awaited before the sentence is on screen: the reveal and the pull
      // run together, which is what makes "it can take a second" true rather
      // than something said after the wait it was warning about.
      if (ready) await pull(result.selected)
    } catch (e: unknown) {
      // The user's message stays in the thread — losing what they typed because
      // the network failed would be its own small betrayal.
      setThinking(false)
      setError(e)
    }
  }

  async function pull(files: AttachableSource[]) {
    setStage('pulling')
    setFailures([])

    const failed: { title: string; error: string }[] = []
    // Sequential on purpose: `addItem` appends by reading the current maximum
    // `position`, so concurrent inserts would read the same maximum and land the
    // shelf in a different order from the one just agreed.
    for (const s of files) {
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
      // a workspace holding 3 of the 5 files they agreed to, with nothing on
      // screen having said so.
      setFailures(failed)
      return
    }
    // The route is a Server Component; this re-reads the shelf and lands the
    // user in the populated WorkspaceShell.
    router.refresh()
  }

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
          disabled={thinking}
        />
      </div>
    </div>
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
        {stage === 'intro' ? (
          <div className="flex flex-1 flex-col items-center justify-center px-10 py-12">
            <div className="flex w-full max-w-[600px] flex-col items-center">
              <h1 className="mb-2 text-center font-display text-[34px] font-medium tracking-[-0.02em] text-ink">
                {dict.workspace.intakeHead}
              </h1>
              <p className="mb-[26px] max-w-[460px] text-center text-[15px] leading-[1.55] text-ink-muted">
                {dict.workspace.intakeSub}
              </p>
              {error !== null && <ErrorBanner error={error} />}
              <div className="w-full rounded-2xl border border-hairline bg-paper px-4 py-3.5 shadow-soft">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void send(draft)}
                  placeholder={dict.workspace.intakePlaceholder}
                  // Hebrew must read RTL as it is typed, without the user
                  // switching the interface language — the same behaviour
                  // ChatComposer and PillComposer already have. This input was
                  // the ONLY composer in the app missing it, which is why the
                  // defect only showed on the workspace's first message.
                  dir="auto"
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
        ) : (
          // THE THREAD. It stays on screen through thinking and through pulling —
          // there is no stage that replaces it, which was the whole complaint.
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-8 pb-6 pt-[34px]">
            {turns.map((t, i) =>
              t.role === 'user' ? (
                <div
                  key={i}
                  dir="auto"
                  className="max-w-[80%] self-end rounded-[14px_14px_4px_14px] bg-ink px-[15px] py-[11px] text-[14px] leading-[1.6] text-paper"
                >
                  {t.content}
                </div>
              ) : (
                <div
                  key={i}
                  dir="auto"
                  className="max-w-[98%] self-start whitespace-pre-wrap text-[14.5px] leading-[1.7] text-ink"
                >
                  {i === animateAt ? (
                    // The thread follows the words down as they land, so a long
                    // answer does not reveal itself below the fold.
                    <Typewriter text={t.content} onReveal={stickToEnd} />
                  ) : (
                    t.content
                  )}
                </div>
              )
            )}

            {thinking && <Dots label={dict.workspace.intakeThinking} />}

            {stage === 'pulling' && failures.length === 0 && <Dots label={dict.workspace.intakeAdding} />}

            {failures.length > 0 && (
              <div
                role="alert"
                dir="auto"
                className="self-start rounded-[10px] border border-hairline bg-paper px-3.5 py-2.5 text-[13px] text-ink"
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
                {/* The ones that DID land are already on the shelf, so the way
                    forward is into the workspace, not a retry that would
                    duplicate them. */}
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="mt-2.5 rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-paper"
                >
                  {dict.workspace.intakeContinueAnyway}
                </button>
              </div>
            )}

            {error !== null && <ErrorBanner error={error} />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* The composer never leaves once the conversation starts — including
          while Atlas is pulling, so the user is never stranded on a spinner. */}
      {stage !== 'intro' && composer}
    </div>
  )
}

function ErrorBanner({ error }: { error: unknown }) {
  const { dict } = useI18n()
  return (
    <div
      role="alert"
      className="mb-4 w-full rounded-[10px] border border-hairline bg-paper px-3.5 py-2.5 text-start text-[13px] text-ink"
    >
      <ErrorLine
        template={dict.workspace.intakeSearchFailed}
        error={error}
        auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
      />
    </div>
  )
}

/** A quiet inline "still here" — NOT a screen takeover. */
function Dots({ label }: { label: string }) {
  return (
    <div dir="auto" className="flex items-center gap-2 self-start text-[13px] text-ink-ghost">
      <span className="flex gap-1">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </span>
      {label}
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-[5px] w-[5px] animate-pulse rounded-full bg-ink-ghost"
      style={{ animationDelay: delay }}
    />
  )
}
