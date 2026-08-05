'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { useDemoState } from '@/lib/demo/DemoStateProvider'
import { ChevronDownIcon, SparkleIcon, ArrowUpIcon, CloseIcon } from '@/components/ds/icons'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { composeReq } from '@/lib/workspace/client'
import { clipFigureHtml } from '@/lib/workspace/clip'
import { HidePaneButton } from './SourceDocument'

// The working document (design lines 1802-1887) — the workspace's deliverable.
//
// Genuinely editable via contentEditable + document.execCommand: deprecated, but
// universally supported and dependency-free. The spec deliberately rejected an
// editor library this chapter, because a real document model would lock in how
// citations are stored BEFORE the backend chapter decides that.
//
// The document STARTS EMPTY as of 2026-08-04. The fabricated seed it used to
// open with (lib/demo/seedDocument, deleted) was demo-marked but became
// untenable the moment Atlas could write real drafts into this same body.

/** A "connect to document" request from another pane. `nonce` so the same
 *  passage asked about twice still fires twice. */
export type ConnectRequest = {
  nonce: number
  title: string
  text: string
  instruction: string
}

/** A clipping cut from a source pane, on its way into the body. Same nonce
 *  discipline as {@link ConnectRequest}: the same clip may be added twice. */
export type ClipRequest = {
  nonce: number
  dataUrl: string
  /** the source's name, for the caption */
  title: string
  /** already-localised page run, e.g. "page 12" */
  pageLabel: string
}

export function WorkingDocument({
  workspaceId,
  title,
  onRenameDocument,
  connect,
  onConnected,
  clip,
  onClipped,
  onHidePane,
}: {
  workspaceId: string
  /** the STORED title, which may be '' — the placeholder shows the display name */
  title: string
  onRenameDocument: (next: string) => void
  connect?: ConnectRequest | null
  onConnected?: () => void
  clip?: ClipRequest | null
  onClipped?: (ok: boolean) => void
  /** take this pane off the multi-view — present only while several are on screen */
  onHidePane?: () => void
}) {
  const { dict } = useI18n()
  const { docHtml, setDocHtml } = useDemoState()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const [empty, setEmpty] = useState(true)
  /** the "tell Atlas what to write" line, open or not */
  const [writeOpen, setWriteOpen] = useState(false)
  const [writeDraft, setWriteDraft] = useState('')
  const [writing, setWriting] = useState(false)
  const [writeError, setWriteError] = useState<unknown>(null)
  const writeRef = useRef<HTMLInputElement>(null)

  /**
   * Splice a passage in WITHOUT touching what is already there.
   *
   * The whole safety argument for letting a model write into someone's document
   * lives in this function (see lib/workspace/chat/compose): it only ever
   * INSERTS. `afterHeading` names an existing heading, and the passage lands
   * after that section — i.e. after the heading and everything under it, up to
   * the next heading — which is what "put this under the board section" means to
   * a person. With no anchor it goes at the end.
   */
  const insertFragment = useCallback(
    (fragment: string, afterHeading: string | null) => {
      const body = bodyRef.current
      if (!body) return
      const holder = document.createElement('div')
      holder.innerHTML = fragment
      const nodes = Array.from(holder.childNodes)
      if (nodes.length === 0) return

      const isHeading = (n: Node): boolean => n.nodeType === 1 && /^H[1-3]$/.test((n as Element).tagName)

      let anchor: Node | null = null
      if (afterHeading) {
        anchor =
          Array.from(body.querySelectorAll('h1,h2,h3')).find(
            (h) => (h.textContent ?? '').trim() === afterHeading
          ) ?? null
        // Walk to the end of that section, so the passage joins it rather than
        // wedging between the heading and its own first paragraph.
        if (anchor) {
          let next = anchor.nextSibling
          while (next && !isHeading(next)) {
            anchor = next
            next = next.nextSibling
          }
        }
      }

      if (anchor && anchor.parentNode) {
        let after: Node = anchor
        for (const node of nodes) {
          after.parentNode!.insertBefore(node, after.nextSibling)
          after = node
        }
      } else {
        for (const node of nodes) body.appendChild(node)
      }

      setDocHtml(workspaceId, body.innerHTML)
      setEmpty(!body.innerText.trim())
      ;(nodes[0] as HTMLElement).scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    },
    [setDocHtml, workspaceId]
  )

  /** Headings Atlas is allowed to aim at — read from the live DOM, never guessed. */
  const headings = () =>
    Array.from(bodyRef.current?.querySelectorAll('h1,h2,h3') ?? [])
      .map((h) => (h.textContent ?? '').trim())
      .filter(Boolean)

  const runCompose = useCallback(
    async (instruction: string, passage?: { title: string; text: string } | null) => {
      const text = instruction.trim()
      if (!text || writing) return
      setWriting(true)
      setWriteError(null)
      try {
        const { result } = await composeReq(workspaceId, {
          instruction: text,
          document: bodyRef.current?.innerText ?? '',
          headings: headings(),
          passage: passage ?? null,
        })
        setWriting(false)
        if (!result) {
          // NOT a silent no-op. Inserting nothing while the bar closes looks
          // exactly like success.
          setWriteError(new Error(dict.workspace.docWriteNoAnswer))
          return
        }
        insertFragment(result.html, result.afterHeading)
        setWriteDraft('')
        setWriteOpen(false)
      } catch (e: unknown) {
        setWriting(false)
        setWriteError(e)
      }
    },
    [workspaceId, writing, insertFragment, dict.workspace.docWriteNoAnswer]
  )

  // A "connect to document" request from any pane arrives here already carrying
  // the marked passage and the analyst's instruction for where it goes.
  const lastConnect = useRef(0)
  useEffect(() => {
    if (!connect || connect.nonce === lastConnect.current) return
    lastConnect.current = connect.nonce
    void runCompose(connect.instruction, { title: connect.title, text: connect.text })
    onConnected?.()
  }, [connect, runCompose, onConnected])

  // A CLIPPING GOES IN AS IT WAS CUT — no model, no rewriting. Founder,
  // 2026-08-05: *"we can snip things from the report and actually connect them
  // to the document."* It lands at the end, under a caption naming the source,
  // and `insertFragment` scrolls it into view so the analyst sees it arrive.
  const lastClip = useRef(0)
  useEffect(() => {
    if (!clip || clip.nonce === lastClip.current) return
    lastClip.current = clip.nonce
    const html = clipFigureHtml({ dataUrl: clip.dataUrl, title: clip.title, pageLabel: clip.pageLabel })
    // null means the capture was not our own PNG. It cannot happen from the
    // clipping tool, and if it ever does the caller says so out loud rather than
    // closing a card over a document that gained nothing.
    if (html) insertFragment(html, null)
    onClipped?.(!!html)
  }, [clip, insertFragment, onClipped])

  useEffect(() => {
    if (writeOpen) writeRef.current?.focus({ preventScroll: true })
  }, [writeOpen])

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

  // THE DOCUMENT STARTS EMPTY, and that is the change.
  //
  // It used to open pre-filled with `seedHtml(dict)` — a fabricated brief about
  // Tigbur carrying invented revenue, an invented operating margin and a quote
  // attributed to a real named executive who never said it. Demo-marked, so not
  // dishonest by this repo's rules, but the moment Atlas can WRITE here
  // (2026-08-04) that content stops being a placeholder and starts being
  // something a real draft gets mixed into. An analyst's document opens blank,
  // like every document does.
  const html = docHtml[workspaceId] ?? ''

  // Seed once; afterwards the DOM is the source of truth while editing, so we do
  // NOT rewrite innerHTML on every keystroke (that would reset the caret).
  useEffect(() => {
    if (bodyRef.current && !bodyRef.current.innerHTML.trim() && html) bodyRef.current.innerHTML = html
  }, [html])

  function persist() {
    if (!bodyRef.current) return
    setDocHtml(workspaceId, bodyRef.current.innerHTML)
    setEmpty(!bodyRef.current.innerText.trim())
  }

  function exec(command: string, value?: string) {
    bodyRef.current?.focus()
    document.execCommand(command, false, value)
    persist()
  }

  const tool =
    'flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-ink-muted transition-colors hover:bg-subtle hover:text-ink'

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex flex-none items-center gap-1 border-b border-hairline px-4 py-2">
        {/* THE TOOLS SCROLL; EXPORT AND THE PANE ✕ DO NOT. In a four-pane
            multi-view this pane is ~280px wide, and a single flat row pushed
            whatever sat at its end straight out of the pane — which is where
            the ✕ landed the first time it was added. The controls that must
            stay reachable are the ones that are flex-none. */}
        <div className="atscroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
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
          {/* The ⤷ "cite" button is gone with the fabricated seed it belonged to:
            it inserted a blockquote pre-filled with the demo marker text, which
            is not a citation, and real citations arrive with the passage now
            ("connect to document"). */}

          {/* "Let Atlas write", replacing "Continue this section" — founder,
            2026-08-04. The old button inserted a fixed italic sentence saying no
            model had written it, which was honest and useless. This one opens a
            line and asks what to write. */}
          <button
            type="button"
            onClick={() => setWriteOpen((o) => !o)}
            aria-expanded={writeOpen}
            className={`ms-2 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
              writeOpen ? 'border-transparent bg-ink text-paper' : 'border-hairline text-ink hover:bg-subtle'
            }`}
          >
            <SparkleIcon size={14} className="flex-none" />
            {dict.workspace.docLetAtlasWrite}
          </button>
        </div>

        {/* NO "saved" confirmation here. Nothing saves — edits live in session
            state and are gone on reload. A tick that says otherwise is the
            fake-success class rules/app.md exists to stop. The banner at the top
            of the page already states what is true about this document. */}

        <div ref={exportRef} className="relative flex-none">
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
        {/* The document is a pane like any other in multi-view, so it takes the
            pane ✕ at the far end of its own header row — the same control, the
            same meaning: off the screen, still a tab. */}
        {onHidePane && <HidePaneButton onClick={onHidePane} label={dict.workspace.hidePane} />}
      </div>

      {/* THE LINE WHERE YOU TELL ATLAS WHAT TO WRITE. Founder, 2026-08-04:
          *"this one opens a line where the user can guide atlas what to write in
          the document."* It sits under the toolbar rather than in a dialog, so
          the document stays in view while you describe what you want added to
          it. */}
      {(writeOpen || writing || writeError !== null) && (
        <div className="flex-none border-b border-hairline bg-panel px-4 py-2.5">
          <div className="mx-auto flex max-w-[720px] flex-col gap-2">
            <div className="flex items-center gap-2 rounded-[10px] border border-hairline bg-canvas px-3 py-2">
              <SparkleIcon size={15} className="flex-none text-ink-faint" />
              <input
                ref={writeRef}
                value={writeDraft}
                onChange={(e) => setWriteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runCompose(writeDraft)
                  if (e.key === 'Escape') setWriteOpen(false)
                }}
                disabled={writing}
                placeholder={dict.workspace.docWritePlaceholder}
                dir="auto"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-ghost"
              />
              <button
                type="button"
                onClick={() => void runCompose(writeDraft)}
                disabled={writing || !writeDraft.trim()}
                aria-label={dict.workspace.docLetAtlasWrite}
                className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-ink text-paper disabled:opacity-40"
              >
                <ArrowUpIcon size={13} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setWriteOpen(false)
                  setWriteError(null)
                }}
                aria-label={dict.common.close}
                className="flex flex-none text-ink-ghost hover:text-ink"
              >
                <CloseIcon size={13} strokeWidth={2} />
              </button>
            </div>
            {writing && (
              <div dir="auto" className="flex items-center gap-2 text-[12px] text-ink-ghost">
                <span className="flex gap-1">
                  {['0ms', '150ms', '300ms'].map((d) => (
                    <span
                      key={d}
                      className="inline-block h-[5px] w-[5px] animate-pulse rounded-full bg-ink-ghost"
                      style={{ animationDelay: d }}
                    />
                  ))}
                </span>
                {dict.workspace.docWriting}
              </div>
            )}
            {writeError !== null && (
              <div role="alert" className="text-[12px] text-ink">
                <ErrorLine
                  template={dict.workspace.docWriteFailed}
                  error={writeError}
                  auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
                />
              </div>
            )}
          </div>
        </div>
      )}

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
          {/* The "3 citations · DEMO" line and the fabricated-quote notice are
              both gone with the seed they described. A document that starts
              empty has nothing to disclaim; what goes into it from here comes
              from the shelf or from the analyst's own keyboard. */}
          <div className="relative mt-4">
            {empty && !writing && (
              // A blank contentEditable gives no clue that it is writable, and
              // the two ways to fill it are not obvious. Pointer-events off, so
              // clicking the hint puts the caret in the document underneath.
              <p
                dir="auto"
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 text-[15px] leading-[1.75] text-ink-ghost"
              >
                {dict.workspace.docEmptyHint}
              </p>
            )}
            <div
              ref={bodyRef}
              contentEditable
              suppressContentEditableWarning
              onBlur={persist}
              onInput={() => setEmpty(!bodyRef.current?.innerText.trim())}
              dir="auto"
              className="atlas-doc min-h-[240px] text-[15px] leading-[1.75] text-ink outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
