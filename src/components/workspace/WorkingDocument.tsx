'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { seedHtml } from '@/lib/demo/seedDocument'
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
// The FABRICATED seed content lives in `@/lib/demo/seedDocument` so its markers can
// be unit-tested without React (seedDocument.test.ts). Read the note there before
// touching the quote block — it is the most dangerous element in this chapter and
// its marker has already cost two review rounds.

export function WorkingDocument({
  workspaceId,
  title,
  onRenameDocument,
}: {
  workspaceId: string
  /** the STORED title, which may be '' — the placeholder shows the display name */
  title: string
  onRenameDocument: (next: string) => void
}) {
  const { dict } = useI18n()
  const { docHtml, setDocHtml } = useDemoState()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // Disabling the PDF row removed the menu's only closing affordance (both rows are
  // inert now), so it needs its own — same idiom as the sort menu in WorkspacePicker.
  useEffect(() => {
    if (!exportOpen) return
    const onDown = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [exportOpen])

  // Locale-dependent, so a FRESH seed is never English-only. `html` is a string, so
  // the effect below still compares by value and seeds exactly once.
  // Known limit: once the user edits, the seeded HTML is persisted into docHtml, and
  // switching locale afterwards replays the stored marker in the language it was
  // seeded in. The marker is still there, just not re-localized — acceptable because
  // this whole fabricated block disappears when the backend serves real quotes.
  const html = docHtml[workspaceId] ?? seedHtml(dict)

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

        <div ref={exportRef} className="relative">
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
              {/* NEITHER export is implemented this chapter — both say so rather
                  than render a dead or, worse, a HARMFUL button.
                  PDF used to call window.print(). On this layout (h-screen +
                  overflow-hidden frame, document inside an overflow-auto pane) that
                  emits ONE page clipped to the current scroll offset. globals.css:488
                  DOES have an @media print block — it just contains nothing that
                  unclips this frame, so do not read its existence as a fix. Scrolled to the quote it dropped the demo notice —
                  which sits at the top of the pane — and kept the fabricated quote
                  with its filing-shaped cite line, exporting invented words
                  attributed to a real named executive with no marker at all.
                  Reproduced during review with a real Chromium page.pdf(), not
                  argued. A correct Hebrew PDF needs a server-side render
                  (.claude/rules/app.md) — that is a feature, not a stopgap. */}
              <div className="flex w-full cursor-not-allowed items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[12.5px] text-ink-ghost">
                {dict.workspace.docExportPdf}
                <span className="text-[10.5px]">{dict.workspace.docExportUnavailable}</span>
              </div>
              <div className="flex w-full cursor-not-allowed items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[12.5px] text-ink-ghost">
                {dict.workspace.docExportWord}
                <span className="text-[10.5px]">{dict.workspace.docExportUnavailable}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="atscroll min-h-0 flex-1 overflow-auto px-10 py-9">
        <div className="mx-auto max-w-[720px]">
          {/* THE TITLE IS THE DOCUMENT'S, so it is typed here rather than
              somewhere else. Founder, 2026-08-04: *"the header is just stuck
              i can[t] change it, thats not good."* It was a plain <h1> fed a
              prop — the one piece of a page that is entirely the user's work,
              and the only text on it they could not touch.

              An <input>, not contentEditable: a title is one line, an input
              cannot accept pasted markup, and it will not fight React over the
              caret when the pane re-renders mid-edit (the body below has to
              seed through a ref for exactly that reason). It also gets a real
              placeholder, which is how an unnamed document can read as unnamed
              without "Untitled document" becoming its actual stored title. */}
          <input
            value={title}
            onChange={(e) => onRenameDocument(e.target.value)}
            onKeyDown={(e) => {
              // Enter leaves the field; a document title has no second line.
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            placeholder={dict.workspace.untitledDocument}
            aria-label={dict.workspace.docTitleLabel}
            dir="auto"
            className="mb-2 w-full bg-transparent font-display text-[34px] font-medium tracking-[-0.02em] text-ink outline-none placeholder:text-ink-ghost"
          />
          <div className="mb-2 flex items-center gap-2 font-mono-num text-[11.5px] text-ink-ghost">
            <span dir="ltr">{dict.workspace.docCitations.replace('{n}', '3')}</span>
            <DemoInline />
          </div>
          {/* OUTSIDE contentEditable on purpose, so the user cannot delete it.
              NOTE what this does NOT do: it sits at the top of the scrolling pane,
              so it is absent from anything that captures only the quote further
              down. That is why the <cite> carries its own localized marker — see
              seedHtml(). This notice covers the screen; that one covers the trip. */}
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
