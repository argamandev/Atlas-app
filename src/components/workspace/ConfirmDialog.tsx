'use client'

import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ErrorLine } from '@/components/projects/ErrorLine'

// The workspace's destructive confirmations.
//
// SHARED BECAUSE THE OBLIGATION IS SHARED, not because two dialogs looked alike.
// `.claude/rules/db.md` and countWorkspaceContents's own header bind every
// delete affordance in this app to stating what it is about to destroy BEFORE
// destroying it — a rule that is trivially satisfied when a component owns the
// sentence, and quietly lost the third time somebody writes their own dialog in
// a hurry. `lines` is required and cannot be empty: a confirmation with nothing
// to say is exactly the one that should not have been written.
//
// The dialog stays MOUNTED while the request runs and renders its own failure.
// An optimistic close would show a workspace vanishing from the grid on a
// request the server refused — the class rules/app.md files under "gating an
// endpoint changes every caller's ERROR path".

export function ConfirmDialog({
  title,
  titleValue,
  lines,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  /**
   * The heading TEMPLATE, containing `{name}` — not a finished string.
   *
   * It arrives unsubstituted on purpose. The thing being destroyed is named by
   * the user or by a filing, so it is routinely Hebrew inside an English
   * sentence or the reverse, and a pre-joined string gives this component no
   * way to isolate it. See the render below for what that cost when it was a
   * plain string.
   */
  title: string
  /** what goes where `{name}` is, isolated in its own <bdi> */
  titleValue?: string
  /** what will be destroyed, stated before it is. Never empty. */
  lines: string[]
  confirmLabel: string
  pending: boolean
  error: unknown
  onConfirm: () => void
  onCancel: () => void
}) {
  const { dict } = useI18n()
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Escape cancels — but never while the delete is in flight, because there is
  // nothing to cancel by then and closing would hide the outcome.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, onCancel])

  // Focus lands on the destructive button so the keyboard path is short — and
  // deliberately NOT on a hidden one: this dialog only ever opens by a click
  // that meant it.
  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  return (
    <div
      onMouseDown={() => {
        if (!pending) onCancel()
      }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(28,24,14,.28)] p-8"
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-[18px] border border-hairline bg-canvas px-6 pb-5 pt-[22px] shadow-modal"
      >
        {/* THE HEADING IS A MIXED LINE — occurrence 5 of the <bdi> rule in
            .claude/rules/app.md. This comment used to claim the opposite ("one
            run, a workspace name or a file name, not a mixed line"), which is
            how the substitution got written in the first place.

            MEASURED, not eyeballed, because the first attempt to call this bug
            was wrong: a trailing YEAR ("…לשנת 2021") looks orphaned beside the
            English verb but is simply where a number belongs at the left edge of
            an RTL run, and both renderings are byte-identical. Probing all 4
            templates × 8 realistic names in the live page found 6 that genuinely
            differ, e.g. the real workspace named `תיגבור קבוצה.` —

              without <bdi>   Delete הצובק רובגית.?     ← the name's own period,
              with    <bdi>   Delete .הצובק רובגית?        pulled off and parked
                                                           against the "?"

            — and the mirror image in Hebrew, where a name like `Q1 דוח` has its
            Latin run thrown to the wrong side of the sentence. Same damage as
            the <cite> case that made this a rule.

            That is also why the template arrives UNSUBSTITUTED: <bdi> can only
            isolate a run the component can still see. Container keeps the page's
            direction, each run resolves on its own. */}
        <div dir="auto" className="font-display text-[19px] font-medium tracking-[-0.015em] text-ink">
          {titleValue === undefined
            ? title
            : (() => {
                const [before, after = ''] = title.split('{name}')
                return (
                  <>
                    {before}
                    <bdi>{titleValue}</bdi>
                    {after}
                  </>
                )
              })()}
        </div>

        <div className="mt-2.5 flex flex-col gap-1.5">
          {lines.map((line, i) => (
            <p key={`${i}-${line}`} dir="auto" className="text-[13px] leading-[1.6] text-ink-muted">
              <bdi>{line}</bdi>
            </p>
          ))}
        </div>

        {error !== null && (
          <div
            role="alert"
            className="mt-3.5 rounded-[10px] border border-hairline bg-paper px-3 py-2 text-[12.5px] text-ink"
          >
            <ErrorLine
              template="{error}"
              error={error}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-[9px] border border-hairline px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-subtle disabled:opacity-50"
          >
            {dict.common.cancel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-[9px] bg-[#A33A2A] px-3.5 py-2 text-[13px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? dict.common.working : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
