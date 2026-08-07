'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { ChevronDownIcon, SparkleIcon, ArrowUpIcon, CloseIcon } from '@/components/ds/icons'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { composeReq } from '@/lib/workspace/client'
import { insertIntoBody } from '@/lib/workspace/docInsert'
import {
  BLOCK_TAGS,
  blockElements,
  blocksToHtml,
  domToBlocks,
  type Citation,
  type DocBlock,
} from '@/lib/workspace/blocks'
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

/**
 * EVERY TOP-LEVEL RUN BECOMES A BLOCK ELEMENT, so the document can be read.
 *
 * The first characters typed into an empty contentEditable are a bare TEXT
 * NODE, not a paragraph — Chrome only starts making `<p>`s once Enter is
 * pressed. `domToBlocks` walks `children`, which is elements only, so an
 * analyst's opening sentence read as ZERO blocks and the whole document saved
 * as nothing. It failed in the quietest possible way: the text was on screen,
 * no error anywhere, and the rows simply never appeared. Found by querying the
 * API after typing, not by looking at the page.
 *
 * The caret is preserved by re-selecting the SAME text node after it moves:
 * appending a node to a new parent does not destroy it, so the saved Range
 * still points at the right characters.
 */
function wrapLooseContent(body: HTMLElement) {
  const sel = window.getSelection()
  const saved =
    sel && sel.rangeCount > 0 && body.contains(sel.anchorNode)
      ? { node: sel.anchorNode, offset: sel.anchorOffset }
      : null

  let changed = false
  let node = body.firstChild
  while (node) {
    const isBlock = node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName)
    if (isBlock) {
      node = node.nextSibling
      continue
    }
    // An empty text node between two blocks is whitespace, not content.
    if (node.nodeType === Node.TEXT_NODE && !(node.textContent ?? '').trim()) {
      const next = node.nextSibling
      node.parentNode?.removeChild(node)
      node = next
      continue
    }
    const p = document.createElement('p')
    body.insertBefore(p, node)
    let run: ChildNode | null = node
    while (run && !(run.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((run as Element).tagName))) {
      const after: ChildNode | null = run.nextSibling
      p.appendChild(run)
      run = after
    }
    changed = true
    node = run
  }

  if (changed && saved?.node && body.contains(saved.node)) {
    try {
      const range = document.createRange()
      range.setStart(saved.node, Math.min(saved.offset, (saved.node.textContent ?? '').length))
      range.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(range)
    } catch {
      /* the caret is a nicety here; losing it must never lose the save */
    }
  }
}

export function WorkingDocument({
  workspaceId,
  title,
  onRenameDocument,
  insert,
  onInserted,
  incoming = false,
  onHidePane,
  blocks,
  onSave,
  saveError,
}: {
  workspaceId: string
  /** the STORED title, which may be '' — the placeholder shows the display name */
  title: string
  onRenameDocument: (next: string) => void
  /**
   * A fragment the SHELL prepared — a composed passage, a clipping, whatever the
   * analyst connected. The shell owns that work now (founder, 2026-08-05: *"it
   * needs to happen in the back … you don't need to be sent into the document"*),
   * because it has to happen whether or not this pane is mounted. When it is,
   * the shell hands the fragment here so it lands in the LIVE body — the DOM the
   * analyst may be typing into — rather than through a re-seed that would eat
   * their caret.
   */
  insert?: {
    nonce: number
    html: string
    afterHeading: string | null
    citation?: Citation | null
  }[]
  /** applied AND saved — `ok` is false when the save that carried it failed */
  onInserted?: (nonce: number, ok: boolean) => void
  /** the shell is composing something for this document right now */
  incoming?: boolean
  /** take this pane off the multi-view — present only while several are on screen */
  onHidePane?: () => void
  /** the document as the database has it — the shell owns these rows */
  blocks: DocBlock[]
  /**
   * Hand the screen to the shell to be saved, and get back the ids of anything
   * it created so they can be written onto the elements they came from. Without
   * that write-back the next save sees the same element with no id and creates
   * it a second time.
   */
  onSave: (drafts: ReturnType<typeof domToBlocks>) => Promise<{ draftIndex: number; id: string }[] | null>
  /** the last save failed — the pane says so rather than looking saved */
  saveError?: unknown
}) {
  const { dict } = useI18n()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  /** the same element, kept for the unmount flush — React nulls bodyRef first */
  const liveBodyRef = useRef<HTMLDivElement | null>(null)
  /** the rows, readable from a callback that runs before the seed effect */
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const [empty, setEmpty] = useState(true)
  /** the "tell Atlas what to write" line, open or not */
  const [writeOpen, setWriteOpen] = useState(false)
  const [writeDraft, setWriteDraft] = useState('')
  const [writing, setWriting] = useState(false)
  const [writeError, setWriteError] = useState<unknown>(null)
  const writeRef = useRef<HTMLInputElement>(null)
  /** debounce for persist-while-typing (see the body's onInput) */
  const typeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (typeTimer.current) clearTimeout(typeTimer.current)
    },
    []
  )

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
    (fragment: string, afterHeading: string | null, citation?: Citation | null) => {
      const body = bodyRef.current
      if (!body) return
      // SEED BEFORE SPLICING, OR THE SPLICE *IS* THE DOCUMENT.
      //
      // A fragment can be waiting at the moment this pane mounts — the analyst
      // connected a passage, closed the pane while Atlas wrote, then came back
      // through the pill's own "Open". The effect that applies it is declared
      // above the one that seeds the body from the store, and effects run in
      // declaration order, so the splice landed in an EMPTY body and then
      // persisted that body as the whole document; the seed, finding words in
      // the body, then skipped. One paragraph replaced everything the analyst
      // had written, under a pill reading "Added to your document".
      //
      // Restoring here rather than reordering the effects: this is the function
      // that must never write into a body it has not filled, so the guarantee
      // belongs to it and not to the order two hooks happen to sit in.
      if (!body.innerHTML.trim() && blocksRef.current.length) {
        body.innerHTML = blocksToHtml(blocksRef.current)
      }
      // The placement rule lives in lib/workspace/docInsert, because the shell
      // runs the same one on the stored rows when this pane is not mounted.
      const first = insertIntoBody(body, fragment, afterHeading)
      if (!first) return
      // A CITED INSERT IS MARKED ON THE ELEMENT, because that attribute is what
      // makes the diff read the block back as `quote` rather than as an ordinary
      // paragraph — and `quote` is what the database requires a source for.
      if (citation) {
        for (const el of blockElements(body)) {
          if (el === first || el.contains(first)) {
            el.setAttribute('data-source-item', citation.source_item_id)
            break
          }
        }
      }
      setEmpty(!body.innerText.trim())
      first.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      requestSave()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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

  /**
   * WHAT THE SHELL PREPARED, LANDING IN THE LIVE BODY.
   *
   * Every connected passage and every clipping now arrives this way — already
   * composed, already sanitised — because the work happens whether or not this
   * pane exists. When it does not, the shell splices the same fragment into the
   * stored HTML and this pane picks it up at its next mount.
   *
   * A LIST, applied in order, each one at most once. `lastInsert` is the high-
   * water mark rather than a flag, so React 18's double-invoked effects cannot
   * apply the same fragment twice and a second passage arriving while the first
   * is still queued cannot displace it.
   */
  const lastInsert = useRef(0)
  useEffect(() => {
    if (!insert?.length) return
    const fresh = insert.filter((i) => i.nonce > lastInsert.current)
    if (!fresh.length) return
    lastInsert.current = fresh[fresh.length - 1].nonce
    for (const i of fresh) insertFragment(i.html, i.afterHeading, i.citation)
    // SAVED NOW, NOT IN 700ms, AND THE OUTCOME IS REPORTED. The shell used to
    // announce "added to your document" the moment it queued this, which is
    // before the pane had applied anything and long before a row existed.
    void saveNowRef.current().then((ok) => onInserted?.(lastInsert.current, ok))
  }, [insert, insertFragment, onInserted])

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
  const html = blocksToHtml(blocks)

  // Seed once; afterwards the DOM is the source of truth while editing, so we do
  // NOT rewrite innerHTML on every keystroke (that would reset the caret).
  //
  // SEEDING ALSO ENDS THE EMPTY STATE. `empty` starts true and was only ever
  // cleared by typing or by an insert, so a document that already had words in
  // it came back from a tab switch with the placeholder — "Write here — or tell
  // Atlas what to draft" — painted straight through the analyst's own first
  // paragraph. Caught in the browser, in the screenshot that was proving
  // something else.
  useEffect(() => {
    if (bodyRef.current && !bodyRef.current.innerHTML.trim() && html) {
      bodyRef.current.innerHTML = html
      setEmpty(!bodyRef.current.innerText.trim())
    }
    // The REASON a citation is struck through, in the reader's language. The
    // marker itself is set by blocksToHtml, which is locale-free on purpose;
    // the words belong here.
    bodyRef.current
      ?.querySelectorAll('[data-citation="missing"] .atlas-quote-cite')
      .forEach((el) => el.setAttribute('data-absent', dict.workspace.citationAbsent))
  }, [html, dict.workspace.citationAbsent])

  /**
   * SAVE WHAT IS ON SCREEN.
   *
   * The DOM is the source of truth while the analyst is typing — that is what
   * keeps the caret still — so saving means reading it back as blocks and
   * handing them up. The ids that come back are written onto the elements they
   * were created from; skipping that write-back would make every later save
   * create the same paragraph again.
   */
  const saveNow = useCallback(async (): Promise<boolean> => {
    // The element, not the ref: on unmount React has already nulled `bodyRef`
    // by the time a cleanup runs, so the flush that was meant to catch the last
    // 700ms of typing was reading null and saving nothing at all.
    const body = bodyRef.current ?? liveBodyRef.current
    if (!body) return false
    wrapLooseContent(body)
    setEmpty(!body.innerText.trim())
    const drafts = domToBlocks(body)
    const assigned = await onSave(drafts)
    if (!assigned) return false
    if (!assigned.length) return true
    // THE ELEMENTS ARE RE-READ HERE, and that is deliberate: the analyst may
    // have typed while the request was in flight. Matching by the draft's own
    // body rather than trusting the index means a DOM that moved cannot put a
    // new row's id on somebody else's paragraph.
    const els = blockElements(body)
    for (const { draftIndex, id } of assigned) {
      const el = els[draftIndex]
      if (!el || el.getAttribute('data-block-id')) continue
      if ((el.innerHTML ?? '').trim() !== drafts[draftIndex]?.body) continue
      el.setAttribute('data-block-id', id)
    }
    return true
  }, [onSave])

  const saveNowRef = useRef(saveNow)
  saveNowRef.current = saveNow
  const requestSave = useCallback(() => {
    if (typeTimer.current) clearTimeout(typeTimer.current)
    // 700ms: long enough that a sentence is one save rather than forty, short
    // enough that "I typed it and switched tabs" is not a gamble.
    typeTimer.current = setTimeout(() => void saveNowRef.current(), 700)
  }, [])

  // LEAVING THE PANE SAVES IT. The debounce is cleared on unmount, so without
  // this a pane switch inside the last 700ms of typing threw those keystrokes
  // away — and a pane switch is exactly what an analyst does after writing a
  // sentence about the thing they were reading.
  useEffect(
    () => () => {
      if (typeTimer.current) {
        clearTimeout(typeTimer.current)
        void saveNowRef.current()
      }
    },
    []
  )

  function exec(command: string, value?: string) {
    bodyRef.current?.focus()
    document.execCommand(command, false, value)
    requestSave()
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

        {/* STILL NO "saved" tick, for a reason that has now INVERTED.
            It used to be that nothing saved: edits lived in session state and
            were gone on reload, so a tick would have been the fake-success class
            rules/app.md exists to stop, and the demo banner overhead carried the
            caveat. Both of those are gone. Every edit is now written — debounced
            700ms, flushed on blur and on unmount, serialised through the shell's
            one chain — so the tick would be true, and it is left out because a
            document that saves reliably should not need to keep announcing it.
            What is NOT silent is failure: `docSaveError` renders in the header.
            The distinction worth keeping: say nothing when it works, say
            something when it does not. */}

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

      {/* A DOCUMENT THAT IS NOT SAVING MUST SAY SO WHILE YOU ARE STILL TYPING.
          The worst version of this failure is the silent one: the analyst keeps
          writing into something that stopped keeping any of it, and finds out
          on the next reload. It sits above the page rather than in a corner,
          because it is not a status — it is a reason to stop. */}
      {saveError != null && (
        <div
          role="alert"
          className="flex-none border-b border-hairline bg-[rgba(180,60,60,.08)] px-10 py-2 text-[12px] text-ink"
        >
          <ErrorLine
            template={dict.workspace.docSaveFailed}
            error={saveError}
            auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
          />
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
              ref={(el) => {
                bodyRef.current = el
                // Kept past unmount on purpose — the flush below needs it.
                if (el) liveBodyRef.current = el
              }}
              contentEditable
              suppressContentEditableWarning
              onBlur={() => void saveNow()}
              onInput={() => {
                setEmpty(!bodyRef.current?.innerText.trim())
                // SAVE WHILE TYPING, not only on blur. The shell composes from
                // the SAVED rows — it has to, because the document may not be
                // mounted — so a paragraph typed and not yet blurred would be a
                // paragraph Atlas cannot see. Debounced, because this is a
                // network write and not a state update.
                requestSave()
              }}
              dir="auto"
              className="atlas-doc min-h-[240px] text-[15px] leading-[1.75] text-ink outline-none"
            />
            {/* ATLAS WORKING, IN THE DOCUMENT'S OWN VOICE. Founder, 2026-08-05:
                *"make the design that shows Atlas is writing the document with
                your dictations more appealing, more smooth, and more in the
                background — not something that's on the screen and you have to
                see it."* What used to happen was the "tell Atlas what to write"
                PANEL opening with an empty input, on a request the analyst had
                already dictated: a form asking for something it had been given.
                This is a line where the passage will land, and nothing else. */}
            {incoming && (
              <div className="mt-4 flex items-center gap-2.5" aria-live="polite">
                <SparkleIcon size={14} className="flex-none animate-pulse text-ink-ghost" />
                <span className="whitespace-nowrap text-[13px] text-ink-ghost">
                  {dict.workspace.docIncoming}
                </span>
                <span className="atlas-writing-line" aria-hidden />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
