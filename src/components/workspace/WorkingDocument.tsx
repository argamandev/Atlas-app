'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { useDemoState } from '@/lib/demo/DemoStateProvider'
import { DemoInline } from '@/components/ds/DemoBanner'
import { ChevronDownIcon } from '@/components/ds/icons'

// The working document (design lines 1802-1887) — the workspace's deliverable.
//
// Genuinely editable via contentEditable + document.execCommand: deprecated, but
// universally supported and dependency-free. The spec deliberately rejected an
// editor library this chapter, because a real document model would lock in how
// citations are stored BEFORE the backend chapter decides that.
//
// Content is FABRICATED — invented financials for a real TASE issuer, and a
// quote attributed to a NAMED executive of that issuer. That is the most
// dangerous element on the branch, so its marker deliberately lives OUTSIDE the
// editable body: a marker inside `contentEditable` can be deleted by the user
// (and rides out through Export as PDF once it is), and hardcoding it in
// SEED_HTML made it English-only, so a Hebrew reader saw no marker at all on the
// one element most likely to be mistaken for fact.

const SEED_HTML = `
<p>Tigbur runs the ninth-largest shipping operation in the world and roughly <b>40%</b> of Israeli container throughput. The privatization tender closes in September, and the questions that decide the price are less about the fleet than about who is allowed to own it.</p>
<h2>What the filings actually say</h2>
<p>Revenue climbed every year from <b>₪1.21B</b> (2022) to <b>₪1.56B</b> (2025) — an 8.3% CAGR — while operating margin only reached 3.7%. Growth is real; it is not yet profitable growth.</p>
<blockquote data-citation="1">
  <p dir="rtl">אנחנו מעלים את תחזית ההכנסות לשנה כולה לטווח של 1.5 עד 1.6 מיליארד שקל.</p>
  <cite dir="ltr">מוטי בן־ארי · CEO · Q2 2026 call · Q2 2026 deck.pdf</cite>
</blockquote>
<h2>Open questions</h2>
<ul>
  <li>Does the Haifa concession survive a change of control?</li>
  <li>How much of the 2023 restatement is recurring?</li>
  <li>Which sovereign funds sit behind the leading bidder?</li>
</ul>
`.trim()

export function WorkingDocument({ workspaceId, title }: { workspaceId: string; title: string }) {
  const { dict } = useI18n()
  const { docHtml, setDocHtml } = useDemoState()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const html = docHtml[workspaceId] ?? SEED_HTML

  // Seed once; afterwards the DOM is the source of truth while editing, so we do
  // NOT rewrite innerHTML on every keystroke (that would reset the caret).
  useEffect(() => {
    if (bodyRef.current && !bodyRef.current.innerHTML.trim()) bodyRef.current.innerHTML = html
  }, [html])

  function persist() {
    if (!bodyRef.current) return
    setDocHtml(workspaceId, bodyRef.current.innerHTML)
  }

  function exec(command: string, value?: string) {
    bodyRef.current?.focus()
    document.execCommand(command, false, value)
    persist()
  }

  function insertContinuation() {
    bodyRef.current?.focus()
    // Explicitly marked: no model produced this, and it must not read as generated.
    document.execCommand(
      'insertHTML',
      false,
      `<p data-demo="1"><em>${dict.workspace.docContinueInserted}</em></p>`
    )
    persist()
  }

  const tool =
    'flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink'

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex flex-none items-center gap-1 border-b border-hairline px-4 py-2">
        <button
          type="button"
          title={dict.workspace.docToolHeading}
          onClick={() => exec('formatBlock', '<h2>')}
          className={`${tool} font-semibold`}
        >
          H
        </button>
        <button
          type="button"
          title={dict.workspace.docToolBold}
          onClick={() => exec('bold')}
          className={`${tool} font-bold`}
        >
          B
        </button>
        <button
          type="button"
          title={dict.workspace.docToolItalic}
          onClick={() => exec('italic')}
          className={`${tool} italic`}
        >
          I
        </button>
        <button
          type="button"
          title={dict.workspace.docToolBullet}
          onClick={() => exec('insertUnorderedList')}
          className={`${tool} text-[17px]`}
        >
          •
        </button>
        <button
          type="button"
          title={dict.workspace.docToolQuote}
          onClick={() => exec('formatBlock', '<blockquote>')}
          className={`${tool} text-[20px] leading-none`}
        >
          “
        </button>
        <button
          type="button"
          title={dict.workspace.docToolCite}
          onClick={() =>
            exec(
              'insertHTML',
              `<blockquote data-citation="1"><p>${dict.demo.inlineLabel} — ${dict.demo.inlineHint}</p></blockquote>`
            )
          }
          className={tool}
        >
          ⤷
        </button>

        <button
          type="button"
          onClick={insertContinuation}
          className="ms-2 flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12.5px] font-medium text-ink hover:bg-subtle"
        >
          ✦ {dict.workspace.docContinue}
        </button>

        <span className="flex-1" />
        {/* NO "saved" confirmation here. Nothing saves — edits live in session
            state and are gone on reload. A tick that says otherwise is the
            fake-success class rules/app.md exists to stop. The banner at the top
            of the page already states what is true about this document. */}

        <div className="relative">
          <button
            type="button"
            onClick={() => setExportOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-medium text-paper"
          >
            {dict.workspace.docExport}
            <ChevronDownIcon size={13} strokeWidth={2} />
          </button>
          {exportOpen && (
            <div className="absolute top-[calc(100%+6px)] z-30 min-w-[180px] rounded-[10px] border border-hairline bg-canvas p-1.5 shadow-menu ltr:right-0 rtl:left-0">
              <button
                type="button"
                onClick={() => {
                  setExportOpen(false)
                  window.print()
                }}
                className="w-full rounded-md px-2.5 py-2 text-start text-[12.5px] text-ink hover:bg-subtle"
              >
                {dict.workspace.docExportPdf}
              </button>
              {/* Word export is NOT implemented — say so rather than render a dead button */}
              <div className="flex w-full cursor-not-allowed items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[12.5px] text-ink-ghost">
                {dict.workspace.docExportWord}
                <span className="text-[10.5px]">{dict.workspace.docExportWordUnavailable}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="atscroll min-h-0 flex-1 overflow-auto px-10 py-9">
        <div className="mx-auto max-w-[720px]">
          <h1 dir="auto" className="mb-2 font-display text-[34px] font-medium tracking-[-0.02em] text-ink">
            {title}
          </h1>
          <div className="mb-2 flex items-center gap-2 font-mono-num text-[11.5px] text-ink-ghost">
            <span dir="ltr">{dict.workspace.docCitations.replace('{n}', '3')}</span>
            <DemoInline />
          </div>
          {/* OUTSIDE contentEditable on purpose — the user cannot delete this,
              so it survives into Export as PDF with the quote it describes. */}
          <div
            dir="auto"
            className="mb-6 flex items-start gap-2 rounded-lg bg-[rgba(180,140,60,.13)] px-2.5 py-2 text-[12px] leading-[1.5] text-[#8A6A2F]"
          >
            <DemoInline />
            <span>{dict.workspace.docQuoteDemo}</span>
          </div>
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            onBlur={persist}
            dir="auto"
            className="atlas-doc text-[15px] leading-[1.75] text-ink outline-none"
          />
        </div>
      </div>
    </div>
  )
}
