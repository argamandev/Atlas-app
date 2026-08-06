'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import {
  ChevronLeftIcon,
  PencilIcon,
  PlusIcon,
  CloseIcon,
  SparkleIcon,
  CollapseIcon,
  ChevronRightIcon,
} from '@/components/ds/icons'
import { WorkspaceDetailColumn, type DetailKey } from './WorkspaceDetailColumn'
import { WorkingDocument } from './WorkingDocument'
import { WorkspaceDocs } from './WorkspaceDocs'
import { type Workspace, type WorkspaceBlockRow } from '@/lib/workspace/data'
import {
  blankBlock,
  blockHeadings,
  blocksToText,
  diffBlocks,
  fragmentToDrafts,
  insertIndexFor,
  toDocBlock,
  type BlockOp,
  type Citation,
  type DocBlock,
  type DraftBlock,
} from '@/lib/workspace/blocks'
import { addBlockReq, deleteBlockReq, fetchWorkspace, patchBlockReq } from '@/lib/workspace/client'
import { documentTitle } from '@/lib/workspace/present'
import { detectDir } from '@/lib/utils'
import { composeReq, patchItemReq, patchWorkspaceReq } from '@/lib/workspace/client'
import { usePlayer } from '@/lib/player/PlayerProvider'
import { addPane, initialPanes, MAX_PANES, shownPanes } from '@/lib/workspace/panes'
import { clipDerivedHtml, clipFigureHtml, quoteBlockHtml } from '@/lib/workspace/clip'
import { WorkspaceIntake } from './WorkspaceIntake'
import { WorkspaceChat, type AskContext } from './WorkspaceChat'
import { ErrorLine } from '@/components/projects/ErrorLine'
import { appendSnip } from '@/lib/documents/snip'
import type { ChatSnip } from '@/lib/api/chat'

// The populated control layout (design lines 1433-2084): a floating workspace
// panel beside a floating main card with a tab bar. The special tab __doc sits
// alongside file tabs, exactly as the design's tab model does.
//
// __legal IS GONE (2026-08-06). The Legal Due-Diligence row, its scoping form,
// its five-step "running" animation and the six findings it produced were demo
// content from end to end — the steps advanced on YOUR click because nothing was
// running, and the findings were invented legal exposure attributed to a real
// TASE issuer with citations to notes in files nobody had uploaded. There is no
// backend to point it at, so it is removed rather than stubbed: a door that
// opens onto invented legal risk is worse than no door. Reversible in one
// commit if the founder wants it back for a walkthrough.

const DOC_TAB = '__doc'
// The chat is a SIDE PANEL as of 2026-08-04, so nothing opens this tab any more.
// The id survives only so `persistOpen` still refuses to PATCH it if an older
// session's layout ever hands one back — it is not a row and has nothing to save.
const CHAT_TAB = '__chat'

export function WorkspaceShell({
  workspace,
  blocks: initialBlocks = [],
}: {
  workspace: Workspace
  /** the working document as the server read it — see the block engine below */
  blocks?: WorkspaceBlockRow[]
}) {
  const { dict } = useI18n()
  const router = useRouter()

  const [panelOpen, setPanelOpen] = useState(true)
  const [detail, setDetail] = useState<DetailKey | null>(null)
  // THE WORKSPACE REOPENS WARM. `live` is workspace_items.is_open, persisted —
  // founder, 2026-08-03: "the workspace should remember how i left it. it must
  // not open cold every time." This used to be `[files[0].id]`, i.e. it threw
  // away what the user had open and reopened the first source, every time.
  // The rows arrive already ordered by `position`, so the tab order is the
  // order they were left in rather than the order they were attached.
  const openFromLastTime = workspace.files.filter((f) => f.live).map((f) => f.id)
  // NOTHING RECORDED AS OPEN MEANS THE ROOM WAS NEVER ARRANGED, so show the
  // whole shelf rather than picking one file out of it. This used to open
  // `files[0]` — an invented choice either way, and the wrong one: it is what
  // made a workspace holding three agreed sources present exactly one of them
  // (founder, 2026-08-04), and what would leave every workspace built before
  // `is_open` was set on attach still opening with a single tab.
  const allFiles = workspace.files.map((f) => f.id)
  const [openTabs, setOpenTabs] = useState<string[]>(
    openFromLastTime.length > 0 ? openFromLastTime : allFiles.length > 0 ? allFiles : [DOC_TAB]
  )
  const [activeTab, setActiveTab] = useState<string>(openFromLastTime[0] ?? workspace.files[0]?.id ?? DOC_TAB)
  const [split, setSplit] = useState(false)
  const [multi, setMulti] = useState<string[]>([])
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(workspace.name)
  // THE DOCUMENT'S TITLE LIVES HERE, not inside WorkingDocument, because three
  // places show it: the document's own header, its tab chip, and the panel row.
  // Held raw ('' is a real value) and given a display name only at each of those.
  const [docTitleRaw, setDocTitleRaw] = useState(workspace.docTitle)
  const [docTitleError, setDocTitleError] = useState<unknown>(null)
  const docTitleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ASK ATLAS. A passage marked in any source pane opens the chat carrying it.
  // The chat is a TAB, not a separate surface, so it can also sit beside the
  // document it is about in multi-view — which is the point of asking about a
  // passage rather than about a workspace.
  //
  // A SIDE PANEL, not a tab. Founder, 2026-08-04: *"when we mark text we need to
  // be able to ask atlas about it and let it open from the side pannel and be
  // able to communicate with us."* As a tab it REPLACED the document — you asked
  // about a paragraph and the paragraph disappeared, which defeats the point of
  // asking about it. The design already anticipated this: the tab bar's height
  // is fixed so its seam lines up with a side-chat header.
  const [chatOpen, setChatOpen] = useState(false)
  const [askSeed, setAskSeed] = useState<AskContext | null>(null)
  /** a request the chat could not act on itself — handed to the intake flow */
  const [addRequest, setAddRequest] = useState<string | null>(null)
  /** the dialog and the request it was opened with close together — always */
  const closeAddDialog = useCallback(() => {
    setAddOpen(false)
    setAddRequest(null)
  }, [])

  // ── PINGE, the clipping tool, held HERE ────────────────────────────────────
  // Founder, 2026-08-05: *"we need to have the same UX as we have on the viewing
  // live investor call in terms of the snipping tool in Ask Atlas."*
  //
  // The scissors lives in the composer and the pixels live in a PDF pane, and
  // those are siblings — so the shell owns the arming, the clips, and the list
  // of panes that can be cut. The live call solves the same split with a
  // module-level bridge plus a window event, which does not survive several
  // documents being open at once: whichever pane unmounted last would report
  // "nothing to cut" while another PDF was still on screen.
  const [snipArm, setSnipArm] = useState(0)
  const [snips, setSnips] = useState<ChatSnip[]>([])
  const [snipCapped, setSnipCapped] = useState(false)
  const [snippable, setSnippable] = useState<string[]>([])

  const markSnippable = useCallback((itemId: string, can: boolean) => {
    setSnippable((s) => (can ? (s.includes(itemId) ? s : [...s, itemId]) : s.filter((x) => x !== itemId)))
  }, [])

  // A CLIPPING NOW HAS TWO DESTINATIONS, so it is asked where it is going.
  //
  // Founder, 2026-08-05: *"we can snip things from the report and actually
  // connect them, the snippets, to the document."* Until now every clip was a
  // question to Atlas. A clip of a table or a chart is just as often EVIDENCE,
  // and evidence belongs in the analysis.
  //
  // The choice is offered the same way marked TEXT offers it — Ask Atlas, or
  // connect to the document — so the workspace has one answer to "I took
  // something out of a source", whether that something is words or pixels. It
  // costs the chat path one click, which is the price of the destination being
  // visible instead of assumed.
  const [clipDraft, setClipDraft] = useState<{ snip: ChatSnip; title: string } | null>(null)
  const [clipNote, setClipNote] = useState('')
  /**
   * ONE QUESTION AT A TIME.
   *
   * Founder, 2026-08-06: *"when we screenshot a section the user gets presented
   * 'ask atlas / put in document', only when he presses on put in document he
   * gets shown the options about how to insert it in the document."*
   *
   * Both questions used to be on the card at once — the destination buttons AND
   * the three how-chips AND the free-text box — so a clipping headed for the
   * chat arrived under a row of options that had nothing to do with it, and the
   * document button changed its own label depending on a field above it. `where`
   * asks which destination; `how` is reached only by choosing the document, and
   * only then does the form for shaping it exist.
   */
  const [clipStage, setClipStage] = useState<'where' | 'how'>('where')

  /**
   * ═══ EVERYTHING THAT GOES INTO THE WORKING DOCUMENT GOES THROUGH HERE ═══
   *
   * Founder, 2026-08-05: *"when you are marking a text or the snipping tool and
   * you're pressing connect to document, it needs to happen in the back … you
   * don't need to be sent into the document automatically as a user."*
   *
   * That one sentence moved the work. It used to live inside WorkingDocument,
   * which meant the composition could only run while that pane was mounted — so
   * the old code had to yank the analyst into the document tab to do anything,
   * which is exactly what he is asking us to stop doing. The shell can compose
   * with the pane closed because the document's text lives in the store, not in
   * the DOM.
   *
   * `insertQueue` is for when the pane IS mounted: the fragment lands in the
   * live body the analyst may be typing into, rather than through a re-seed that
   * would take their caret with it. When it is not mounted the same fragment is
   * spliced into the stored HTML, and the pane shows it at its next mount.
   *
   * A QUEUE, not one slot. Two passages can be in flight at once (nothing stops
   * an analyst marking a second one while the first composes), and a single slot
   * meant the later arrival overwrote the earlier one before the pane had
   * applied it — an insert reported as "added" that no document ever received.
   */
  const [insertQueue, setInsertQueue] = useState<
    { nonce: number; html: string; afterHeading: string | null; citation: Citation | null }[]
  >([])
  const insertNonce = useRef(0)
  /** what Atlas is composing for the document right now, if anything */
  const [docBusy, setDocBusy] = useState<'passage' | 'clip' | null>(null)
  const [docDone, setDocDone] = useState<'added' | 'failed' | 'nothing' | null>(null)
  /** files Atlas could only read part of — the same caveat the chat already shows */
  const [docPartial, setDocPartial] = useState<string[]>([])
  const docDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── THE WORKING DOCUMENT, AS ROWS ──────────────────────────────────────────
  //
  // Until 2026-08-05 this was `docHtml[workspaceId]` in a React store: one HTML
  // string, in memory, gone on reload. Everything the analyst wrote — and every
  // passage Atlas wrote for them — lasted exactly as long as the tab did. The
  // tables to hold it (`workspace_doc_blocks`), their RLS, their integrity
  // constraints and the whole API over them had been built on 2026-08-03 and
  // then never called by anything.
  //
  // The shell owns the rows and the pane owns the caret. That split is the
  // point: composition has to work with the document pane CLOSED (founder,
  // 2026-08-05: *"it needs to happen in the back"*), so the authoritative copy
  // cannot live in a contentEditable that may not be mounted.
  const [docBlocks, setDocBlocks] = useState<DocBlock[]>(() =>
    [...initialBlocks].sort((a, b) => a.position - b.position).map(toDocBlock)
  )
  const docBlocksRef = useRef(docBlocks)
  docBlocksRef.current = docBlocks
  const [docSaveError, setDocSaveError] = useState<unknown>(null)

  /**
   * Document writes happen ONE AT A TIME, in the order they were asked for.
   *
   * Every writer goes through here — the editor's debounced save, a quoted
   * passage, a clipping, a composed paragraph. Serialising rather than refusing
   * is what makes "nothing is ever silently dropped" true: two overlapping
   * saves would otherwise both see a new paragraph with no id yet and create a
   * row each, and a refused save had nowhere to put the work it was holding.
   */
  const chainRef = useRef<Promise<unknown>>(Promise.resolve())
  const runExclusive = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chainRef.current.then(fn, fn)
    chainRef.current = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }, [])
  // The pill has to clear the docked player, which owns the bottom of the screen
  // and paints after it — otherwise a workspace playing a call covers the status
  // and its "Open" button entirely.
  const { call: playerCall, barHidden: playerBarHidden } = usePlayer()
  const barIsUp = Boolean(playerCall) && !playerBarHidden

  const flashDone = useCallback((state: 'added' | 'failed' | 'nothing') => {
    setDocDone(state)
    if (docDoneTimer.current) clearTimeout(docDoneTimer.current)
    docDoneTimer.current = setTimeout(() => setDocDone(null), 4000)
  }, [])

  /**
   * HOW MANY COMPOSES ARE STILL RUNNING — because "done" is a claim about all of
   * them, not about the one that happened to finish first. With a single flag,
   * marking a second passage while the first was still composing produced
   * "Added to your document" while the second was mid-flight, which reads as
   * everything having landed.
   */
  const docJobs = useRef(0)
  const doneWhenIdle = useCallback(
    (state: 'added' | 'failed' | 'nothing') => {
      if (docJobs.current > 0) return
      flashDone(state)
    },
    [flashDone]
  )
  useEffect(
    () => () => {
      if (docDoneTimer.current) clearTimeout(docDoneTimer.current)
    },
    []
  )

  /**
   * WHAT IS ON SCREEN *NOW*, AND WHAT THE DOCUMENT SAYS *NOW*.
   *
   * These have to be read at the moment the fragment is ready, which is seconds
   * after the analyst asked — a model call, not a keystroke. Reading them from a
   * `useCallback` closure meant reading the layout as it stood when the question
   * was asked, and both directions of that mistake lost work silently:
   *
   *   · captured "pane open", closed by the time it landed → the fragment went
   *     to a pane that no longer existed, and the pending insert then applied at
   *     the pane's NEXT mount into a body that had not been seeded yet, which
   *     replaced the analyst's whole document with the new paragraph;
   *   · captured "pane closed", opened by the time it landed → the fragment was
   *     spliced into the stored HTML, the mounted pane refuses to re-seed over a
   *     body that already has words in it, and the next keystroke persisted the
   *     DOM back over the store and took the paragraph with it.
   *
   * Both said "Added to your document". Refs, updated every render, are what
   * make the question answerable at the time it is actually asked.
   */
  const paneStateRef = useRef({ split, openTabs, multi, activeTab })
  paneStateRef.current = { split, openTabs, multi, activeTab }

  /** Is the working document a pane on screen right now? `shownPanes` is the
   *  renderer's own rule — asking it here is what keeps the two from drifting. */
  const docPaneShown = () => shownPanes(paneStateRef.current).includes(DOC_TAB)

  /**
   * Apply one round of block operations, and answer with the ids that were
   * created so the caller can put them on the elements they came from.
   *
   * SINGLE FILE, ALWAYS. Two overlapping saves would both see a new paragraph
   * with no id yet and both create a row for it — the document would grow a
   * duplicate every time the analyst typed faster than the network. A second
   * save while one is running sets a flag and runs after, which is also what
   * makes "the last thing I typed is saved" true rather than likely.
   */
  const applyOps = useCallback(
    async (ops: BlockOp[]): Promise<{ draftIndex: number; row: DocBlock }[]> => {
      const created: { draftIndex: number; row: DocBlock }[] = []
      // Deletes and updates can go together; creates are sequential so their
      // positions land in the order the analyst sees them.
      await Promise.all(
        ops
          .filter((o) => o.op !== 'create')
          .map((o) =>
            o.op === 'delete'
              ? deleteBlockReq(workspace.id, o.id)
              : patchBlockReq(workspace.id, o.id, { body: o.body, position: o.position })
          )
      )
      for (const o of ops) {
        if (o.op !== 'create') continue
        const c = o.citation
        const { block } = await addBlockReq(workspace.id, {
          kind: o.kind,
          body: o.body,
          position: o.position,
          ...(c
            ? {
                source_item_id: c.source_item_id,
                source_label: c.source_label,
                source_quote: c.source_quote,
                ...(c.source_page != null ? { source_page: c.source_page } : {}),
                ...(c.source_line_id ? { source_line_id: c.source_line_id } : {}),
              }
            : {}),
        })
        created.push({ draftIndex: o.draftIndex, row: toDocBlock(block) })
      }
      return created
    },
    [workspace.id]
  )

  /**
   * The screen, saved.
   *
   * The pane hands over what the DOM currently says; the difference against the
   * last known rows is the work. Returns the ids of anything created so the
   * pane can write them back onto its elements — without that, the next save
   * would see the same element with no id and create it a second time.
   */
  const saveDocument = useCallback(
    (
      /**
       * The drafts, or a FUNCTION that produces them.
       *
       * A function is what a programmatic write must pass. `putInDocument` builds
       * its list by splicing into the rows it can see, and building that list
       * OUTSIDE the lock meant two quick writes both started from the same
       * pre-save picture: the second one's diff then deleted the row the first
       * had just created, and both reported "added". Producing the drafts inside
       * the lock is what makes "one writer at a time" actually mean anything —
       * serialising the WRITES while racing the READS fixes nothing.
       */
      source: DraftBlock[] | (() => DraftBlock[])
    ): Promise<{ draftIndex: number; id: string }[] | null> =>
      // ONE WRITER AT A TIME, AND NOTHING IS EVER DROPPED.
      //
      // This used to refuse a save that arrived while another was running,
      // setting a flag so the EDITOR would re-read the DOM afterwards. That is
      // right for a keystroke and silently wrong for everything else: a
      // programmatic write — a quoted passage, a clipping, a composed paragraph
      // — is not in the DOM, so "read the DOM again later" threw it away. With
      // the document pane closed there was not even an editor to re-read, so
      // the write vanished with no error and the pill said "added".
      //
      // A promise chain serialises instead of refusing, so every caller's work
      // happens, in order.
      runExclusive(async () => {
        // Read the rows and build the drafts INSIDE the lock, in that order.
        const drafts = typeof source === 'function' ? source() : source
        const ops = diffBlocks(docBlocksRef.current, drafts)
        if (ops.length === 0) return []
        try {
          const created = await applyOps(ops)
          // Rebuild from the drafts rather than patching the old list: the drafts
          // ARE the document now, and positions come from their order.
          const byId = new Map(docBlocksRef.current.map((b) => [b.id, b]))
          const createdAt = new Map(created.map((c) => [c.draftIndex, c.row]))
          const next: DocBlock[] = drafts.map((d, i) => {
            const made = createdAt.get(i)
            if (made) return { ...made, position: i }
            const old = d.id ? byId.get(d.id) : undefined
            return old
              ? { ...old, kind: d.kind, body: d.body, position: i }
              : { ...blankBlock(), id: d.id ?? '', kind: d.kind, body: d.body, position: i }
          })
          docBlocksRef.current = next
          setDocBlocks(next)
          setDocSaveError(null)
          return created.map((c) => ({ draftIndex: c.draftIndex, id: c.row.id }))
        } catch (e) {
          // NOT SWALLOWED, and NOT reported as an empty success. An editor that
          // fails to save in silence is the worst shape this repo files: the
          // analyst keeps typing into something that is no longer keeping any of
          // it. `null` is distinguishable from "saved, created nothing".
          setDocSaveError(e)
          // AND RE-READ THE TRUTH, because a round can fail HALFWAY.
          //
          // The deletes and updates go out before the creates, so one failed
          // POST leaves the database holding some of this round and our own
          // list claiming all of it. Every later save then diffs against a
          // fiction: it re-issues a delete for a row that is already gone
          // (which 404s, failing the next round too) and re-creates paragraphs
          // that already exist. The document wedges into permanent failure and
          // grows duplicates on the way. Asking the server what is actually
          // there is the only honest recovery.
          try {
            const fresh = await fetchWorkspace(workspace.id)
            const rows = [...fresh.blocks].sort((a, b) => a.position - b.position).map(toDocBlock)
            docBlocksRef.current = rows
            setDocBlocks(rows)
          } catch {
            /* the resync is best-effort; the error above is what the analyst acts on */
          }
          return null
        }
      }),
    [applyOps, runExclusive]
  )

  /**
   * Put a ready fragment in the document, mounted or not, and say so.
   *
   * The fragment is already sanitised — either built here (clipFigureHtml) or
   * scrubbed by parseCompose on the way out of the model. Nothing unsanitised
   * may reach this function; it goes straight into a contentEditable.
   *
   * Mounted, it goes through the pane so it lands beside the caret and is saved
   * by the same diff as everything else. Not mounted, it is written straight to
   * the database — which is the whole reason the rows live here.
   */
  const putInDocument = useCallback(
    (html: string, afterHeading: string | null, _kind: 'passage' | 'clip', citation?: Citation | null) => {
      if (docPaneShown()) {
        insertNonce.current += 1
        // NOT "added" YET. The pane has to apply this and save it first, and it
        // answers through onInserted — the closed-pane branch below awaits its
        // save, so claiming success here made one button tell two different
        // stories depending on which tab happened to be showing.
        setInsertQueue((q) => [
          ...q,
          { nonce: insertNonce.current, html, afterHeading, citation: citation ?? null },
        ])
        return
      }
      // COMPUTED INSIDE THE LOCK. Splicing against `docBlocksRef.current` out
      // here meant two quick writes both started from the same picture, and the
      // second one's diff deleted the row the first had just created.
      const makeDrafts = (): DraftBlock[] => {
        const at = insertIndexFor(docBlocksRef.current, afterHeading)
        const drafts = fragmentToDrafts(html, at)
        const ordered = [...docBlocksRef.current].sort((a, b) => a.position - b.position)
        return [
          ...ordered.slice(0, at).map((b, i) => ({ id: b.id, kind: b.kind, body: b.body, position: i })),
          // THE CITATION TRAVELS WITH THE DRAFT. It used to set `kind: 'quote'`
          // and nothing else, so the create call carried no source — and the
          // database refuses a quote with no quoted text, which meant the
          // citation the analyst had just asked for vanished on its way in.
          ...drafts.map((d, i) => ({
            ...d,
            ...(citation ? { kind: 'quote' as const, citation } : {}),
            position: at + i,
          })),
          ...ordered.slice(at).map((b, i) => ({
            id: b.id,
            kind: b.kind,
            body: b.body,
            position: at + drafts.length + i,
          })),
        ]
      }
      const next = makeDrafts
      // ONLY SAY "ADDED" IF IT WAS. `saveDocument` answers null when the write
      // failed; reporting success off the back of a promise that merely
      // RESOLVED is the exact shape of lie this surface keeps being reviewed
      // for — and with the pane closed there is no editor on screen to show the
      // error instead.
      void saveDocument(next).then((r) => doneWhenIdle(r === null ? 'failed' : 'added'))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace.id, doneWhenIdle, saveDocument]
  )

  /**
   * Ask Atlas to write something into the document, from wherever the analyst is.
   *
   * The document it reasons about is the STORED html — which is why the editor
   * persists while you type and not only on blur. Same call for a marked passage
   * and for a clipping; the clip variant sends the image too.
   */
  const composeIntoDocument = useCallback(
    async (input: {
      instruction: string
      kind: 'passage' | 'clip'
      passage?: { title: string; text: string }
      clip?: { image: ChatSnip; title: string; pageLabel: string }
    }) => {
      // THE ROWS ARE THE DOCUMENT. Reading the saved blocks rather than a
      // contentEditable is what lets Atlas write into a document whose pane is
      // not on screen — and it means the model reasons about what is actually
      // stored, not about a DOM that may hold unsaved keystrokes.
      const saved = docBlocksRef.current
      docJobs.current += 1
      setDocBusy(input.kind)
      try {
        const { result } = await composeReq(workspace.id, {
          instruction: input.instruction,
          document: blocksToText(saved),
          headings: blockHeadings(saved),
          passage: input.passage ?? null,
          clip: input.clip
            ? { image: input.clip.image, title: input.clip.title, pageLabel: input.clip.pageLabel }
            : null,
        })
        docJobs.current -= 1
        if (docJobs.current === 0) setDocBusy(null)
        if (!result) {
          // NOT a silent no-op: a card that closes over a document which gained
          // nothing is indistinguishable from success (rules/app.md).
          doneWhenIdle('nothing')
          return
        }
        // A clipping's answer keeps the provenance the image would have carried —
        // a table typed out of a filing looks like a table somebody invented.
        const fragment = input.clip
          ? clipDerivedHtml({
              html: result.html,
              title: input.clip.title,
              pageLabel: input.clip.pageLabel,
            })
          : result.html
        if (!fragment) {
          doneWhenIdle('nothing')
          return
        }
        setDocPartial(result.partial ?? [])
        putInDocument(fragment, result.afterHeading, input.kind)
      } catch {
        docJobs.current -= 1
        if (docJobs.current === 0) setDocBusy(null)
        doneWhenIdle('failed')
      }
    },
    [workspace.id, putInDocument, doneWhenIdle]
  )

  const takeSnip = useCallback((snip: ChatSnip, source: { itemId: string; title: string }) => {
    setSnipArm(0) // one clip per arming, as in the call
    setClipDraft({ snip, title: source.title })
    // A FRESH CLIP IS A FRESH QUESTION. Without this the next clipping arrives
    // carrying the last one's instruction — the card opens reading "Extract the
    // data as text" with its button already saying "Let Atlas do it", so someone
    // who wanted a plain screenshot gets a model call they never asked for.
    // Caught in the browser on the second clip of the session, not by a test.
    setClipNote('')
    // Same reasoning, one step up: a new clipping asks where it goes, never
    // reopening on the previous one's second question.
    setClipStage('where')
  }, [])

  // NOTHING WITH A SIDE EFFECT GOES INSIDE A STATE UPDATER. React 18 invokes
  // updaters TWICE in development, so a `setSnips` call from inside one queues
  // two appends and the clip lands in the composer twice — which is exactly what
  // it did, once, before this comment existed. Read the draft from the closure.
  const clipToChat = useCallback(() => {
    if (!clipDraft) return
    const { snip } = clipDraft
    setClipDraft(null)
    setSnips((prev) => {
      const r = appendSnip(prev, snip)
      if (r.dropped) {
        setSnipCapped(true)
        setTimeout(() => setSnipCapped(false), 2500)
      }
      return r.list
    })
    // The clip is a question, so it has to land somewhere it can be asked.
    setChatOpen(true)
  }, [clipDraft])

  // CONNECT TO DOCUMENT. A passage marked anywhere — a source pane, a PDF, an
  // answer Atlas gave — plus one sentence about where it should go. Founder,
  // 2026-08-04: *"he again gives a short description on where to put this text
  // in the document and how, and atlas adds it to the document."*
  //
  // `connectDraft` is the passage waiting for that sentence. What used to follow
  // it — a request object handed to the document pane — is gone: the composition
  // runs here now (see composeIntoDocument), so the analyst stays where they are.
  const [connectDraft, setConnectDraft] = useState<{
    title: string
    text: string
    itemId?: string
    lineId?: string | null
    page?: number | null
  } | null>(null)
  const [connectNote, setConnectNote] = useState('')

  /**
   * THE PASSAGE ITSELF, QUOTED, WITH WHERE IT CAME FROM.
   *
   * The other button on this card asks Atlas to WRITE something from the
   * passage — that produces Atlas's words, which is a different thing from
   * evidence. This one puts the analyst's chosen words in the document
   * verbatim, as a `quote` block carrying the item, the label, the anchor and a
   * snapshot of the words themselves.
   *
   * It costs no model call, which is the point: quoting a source is not a task
   * that needs a language model, and making it one would mean a paraphrase
   * arriving where an exact quotation was asked for.
   */
  const quoteIntoDocument = useCallback(() => {
    if (!connectDraft?.itemId) return
    const { text, title, itemId, lineId, page } = connectDraft
    setConnectDraft(null)
    setConnectNote('')
    putInDocument(quoteBlockHtml({ text, label: title }), null, 'passage', {
      source_item_id: itemId,
      source_label: title,
      source_quote: text,
      ...(lineId ? { source_line_id: lineId } : page != null ? { source_page: page } : {}),
    })
  }, [connectDraft, putInDocument])

  const connectToDocument = useCallback(() => {
    if (!connectDraft || !connectNote.trim()) return
    const passage = { title: connectDraft.title, text: connectDraft.text }
    const instruction = connectNote.trim()
    // Close the card FIRST: the analyst is done with it, and it must not sit
    // there looking like it is still waiting for something.
    setConnectDraft(null)
    setConnectNote('')
    void composeIntoDocument({ instruction, passage, kind: 'passage' })
  }, [connectDraft, connectNote, composeIntoDocument])

  const [layoutError, setLayoutError] = useState<unknown>(null)
  const [renameError, setRenameError] = useState<unknown>(null)
  const [addOpen, setAddOpen] = useState(false)

  // Escape must DISCARD, and the only reliable way to leave the field is to
  // blur it — so the cancel intent has to survive the trip to onBlur. A ref, not
  // state: setting state here would re-render before the blur handler reads it.
  const renameCancelled = useRef(false)

  /**
   * Rename, PERSISTED. Until 2026-08-04 this set local state and nothing else:
   * the header showed the new name, no error appeared, and the old name came
   * back on the next load. Nothing on screen was false in the moment, which is
   * what made it the bad kind of bug — the lie only arrived later, at reload.
   *
   * Optimistic, then REVERTED if the server refuses, because a name left on
   * screen after a rejected write is the same lie one step further along.
   */
  const commitRename = useCallback(
    async (raw: string) => {
      const next = raw.trim()
      setRenaming(false)
      // An empty name is not a rename, it is a mistake — `parseName` rejects it
      // server-side too, so sending it would only produce a needless error.
      if (!next || next === name) return

      const previous = name
      setName(next)
      setRenameError(null)
      try {
        await patchWorkspaceReq(workspace.id, { name: next })
        // The picker is a Server Component; without this, going back can render
        // the router cache's copy and show the OLD name after a real rename.
        router.refresh()
      } catch (e: unknown) {
        setName(previous)
        setRenameError(e)
      }
    },
    [name, workspace.id, router]
  )

  /**
   * Rename the working document, debounced.
   *
   * DEBOUNCED-AND-KEPT rather than optimistic-and-reverted, which is the
   * opposite of `commitRename` above and deliberately so. That one is a discrete
   * act the user has finished, so putting the old name back on refusal is
   * honest. This one fires while they are still typing, and yanking a title out
   * from under a caret mid-word would destroy work to report a failure. So the
   * text stays and the BANNER carries the bad news — which keeps the rule the
   * rename comment states (nothing on screen may quietly become untrue) without
   * paying for it in the user's own characters.
   */
  const renameDocument = useCallback(
    (next: string) => {
      setDocTitleRaw(next)
      setDocTitleError(null)
      if (docTitleTimer.current) clearTimeout(docTitleTimer.current)
      docTitleTimer.current = setTimeout(() => {
        patchWorkspaceReq(workspace.id, { doc_title: next }).catch((e: unknown) => {
          setDocTitleError(e)
        })
      }, 600)
    },
    [workspace.id]
  )

  // A title typed and then navigated away from within the debounce window would
  // otherwise never be sent at all.
  useEffect(() => {
    const timer = docTitleTimer
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  /**
   * A FILE THAT ARRIVES WHILE THE WORKSPACE IS OPEN MUST OPEN.
   *
   * Founder, 2026-08-04, of the Add-a-document panel: *"the files need to
   * actually be pulled! currently they are not pulled."* They were being pulled —
   * the rows were written, `is_open` was true, the shelf count went up. What did
   * not happen is any of it reaching the screen, so from where he sat nothing had
   * happened at all.
   *
   * The cause is a React rule rather than a workspace one, and it is worth naming
   * because it will bite again: `useState(initialValue)` runs its initialiser
   * ONCE. `router.refresh()` re-renders this component with new props, and every
   * one of those `useState` calls below quietly ignores them. `openTabs` was
   * still the list computed when the workspace first mounted.
   *
   * So arrival is tracked explicitly. `seen` starts as whatever was on the shelf
   * at mount, and anything appearing later is genuinely new: it opens, it becomes
   * active, and in multi-view it takes a pane. Files the user CLOSED are not
   * reopened — they are in `seen` already, which is the difference between
   * "arrived" and "present".
   */
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(workspace.files.map((f) => f.id))
      return
    }
    const arrived = workspace.files.filter((f) => !seen.current!.has(f.id)).map((f) => f.id)
    if (arrived.length === 0) return
    for (const id of arrived) seen.current.add(id)

    setOpenTabs((t) => [...t, ...arrived.filter((id) => !t.includes(id))])
    setActiveTab(arrived[arrived.length - 1])
    // Through addPane, so pulling four files at once shows the last three
    // rather than four columns. Reduced left-to-right, which means the ones
    // that survive are the ones that arrived LAST — the same order the tabs
    // were appended in, so pane order still matches tab order.
    if (split) setMulti((m) => arrived.reduce((acc, id) => addPane(acc, id), m))
  }, [workspace.files, split])

  /**
   * Persist one tab's open/closed state — the write half of "remember how I
   * left it". ONE row, not the whole workspace, and it deliberately does not
   * move `workspaces.updated_at`: opening a pane is not an edit.
   *
   * The synthetic tabs (__doc, __chat) are not shelf items and have no row to
   * patch, so they are skipped rather than sent and 404'd.
   */
  const persistOpen = useCallback(
    (id: string, isOpen: boolean) => {
      if (id === DOC_TAB || id === CHAT_TAB) return
      patchItemReq(workspace.id, id, { is_open: isOpen }).catch((e: unknown) => {
        // Surfaced, not swallowed. If this fails the pane still moved on screen
        // but WILL NOT survive a reload, and the user has to be told — a layout
        // that silently forgets is precisely what this chapter set out to fix.
        setLayoutError(e)
      })
    },
    [workspace.id]
  )

  const openTab = useCallback(
    (id: string) => {
      setOpenTabs((t) => (t.includes(id) ? t : [...t, id]))
      setActiveTab(id)
      // In multi-view a newly opened file must APPEAR. Without this it lands as
      // a tab whose pane is not shown, so clicking a file in the panel would
      // look like it did nothing.
      if (split) setMulti((m) => addPane(m, id))
      persistOpen(id, true)
    },
    [persistOpen, split]
  )

  // Escape discards the clipping, like every other transient surface here. It is
  // one drag to cut another, so discarding is cheap; being stuck with a card you
  // cannot dismiss from the keyboard is not.
  useEffect(() => {
    if (!clipDraft) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClipDraft(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clipDraft])

  /**
   * THE OTHER DESTINATION: into the document, as evidence, with its source named.
   *
   * With no instruction the clipping goes in exactly as it was cut — no model,
   * instant. With one, Atlas is asked what to make of the picture (founder,
   * 2026-08-05: *"do I want to add it as a screenshot, do I want to extract the
   * data from that screenshot and only present it as text, do I want to create
   * my own table from it"*) and what lands is its answer, under the same source
   * line the image would have carried.
   */
  const clipToDocument = useCallback(
    (instruction: string) => {
      if (!clipDraft) return
      const { snip, title } = clipDraft
      const pageLabel = dict.workspace.clipPage.replace('{page}', String(snip.page))
      setClipDraft(null)
      const note = instruction.trim()
      if (!note) {
        const html = clipFigureHtml({ dataUrl: snip.dataUrl, title, pageLabel })
        if (html) putInDocument(html, null, 'clip')
        // flashDone, not setDocDone: a pill set directly never gets a dismissal
        // timer, so this one sat on screen until something else replaced it —
        // and an older timer could clear it early, which is the same bug from
        // the other side.
        else flashDone('failed')
        return
      }
      void composeIntoDocument({
        instruction: note,
        clip: { image: snip, title, pageLabel },
        kind: 'clip',
      })
    },
    [clipDraft, dict.workspace.clipPage, putInDocument, composeIntoDocument, flashDone]
  )

  /**
   * Multi-view, ON: every open tab becomes a pane.
   *
   * THE BUG THIS FIXES, in the founder's words (2026-08-04): *"there isn't any
   * multi view function at the pulled files and on the top right there is a
   * screen icon — what does he represent?"* The control was the split toggle,
   * and clicking it set `split` while `multi` was still empty — so the pane list
   * resolved to nothing, the file being read disappeared, and the workspace
   * showed "Nothing open". Multi-view was not missing; it was unreachable,
   * because the only way in was a per-tab `+` that appears ONLY after the toggle
   * has already blanked the screen.
   *
   * Founder decision, asked directly the same day: one click shows ALL open
   * files side by side, and you close what you do not want.
   *
   * CAPPED AT THREE since 2026-08-06, so "all open files" is now "up to three,
   * one of which is certainly the one you were reading" — see initialPanes.
   */
  const toggleSplit = useCallback(() => {
    const next = !split
    if (next) setMulti(initialPanes(openTabs, activeTab))
    setSplit(next)
  }, [split, openTabs, activeTab])

  const closeTab = useCallback(
    (id: string) => {
      // NO setState INSIDE A setState UPDATER — this file's own rule, four
      // hundred lines up, and this was the one place still breaking it. React 18
      // double-invokes updaters in development, so the nested call ran twice;
      // harmless here only because choosing the same next tab twice is
      // idempotent. Both updates are computed from the same list instead.
      const next = openTabs.filter((x) => x !== id)
      setOpenTabs(next)
      setActiveTab((a) => (a === id ? (next[next.length - 1] ?? '') : a))
      setMulti((m) => m.filter((x) => x !== id))
      persistOpen(id, false)
    },
    [openTabs, persistOpen]
  )

  // '' is a real stored title — a document nobody has named yet — so the label
  // is derived at every display site rather than substituted into the fact.
  const shownDocTitle = documentTitle(docTitleRaw, dict)

  // EVERY COUNT COMES OFF THE WORKSPACE NOW. Two of these used to be constants —
  // `WS_THREADS.length` and a sum over invented sessions — so a workspace with
  // no chats and no history read "5" and "8" on the panel, identically for every
  // account. A count is the smallest possible untrue sentence and the easiest to
  // believe. Agents and actions are 0 because nothing produces them yet.
  const sections: { key: DetailKey; label: string; count: number }[] = [
    { key: 'files', label: dict.workspace.sectionFiles, count: workspace.files.length },
    { key: 'agents', label: dict.workspace.sectionAgents, count: workspace.agents.length },
    { key: 'actions', label: dict.workspace.sectionActions, count: workspace.actions.length },
    { key: 'chats', label: dict.workspace.sectionChats, count: 0 },
  ]

  const iconBtn =
    'flex h-6 w-6 flex-none items-center justify-center rounded-md text-ink-ghost transition-colors hover:bg-subtle hover:text-ink'

  return (
    // `relative` so the add-sources overlay's `absolute inset-0` is bounded by
    // the workspace surface rather than escaping to the viewport.
    <div className="relative flex h-full min-h-0 flex-col">
      {/* NO DemoBanner (removed 2026-08-06). Nothing on this surface is invented
          any more: the shelf, the panes, the working document and its citations
          are all real rows, and the three panel sections that were stub-fed now
          render honest empty states instead. A caution bar over a real 171-page
          annual report was itself the untrue thing left on the page. */}
      {/* A layout change that failed to persist still moved on screen, so
          without this the workspace would silently forget on the next reload —
          the very thing this chapter set out to fix. */}
      {(layoutError !== null || renameError !== null || docTitleError !== null) && (
        <div
          role="alert"
          className="mx-3 mt-3 flex flex-col gap-1 rounded-[10px] border border-hairline bg-paper px-3.5 py-2.5 text-[13px] text-ink"
        >
          {layoutError !== null && (
            <ErrorLine
              template={dict.workspace.layoutFailed}
              error={layoutError}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          )}
          {/* BOTH render, never one instead of the other — same reasoning as the
              picker's banner. A rename that failed while a pane also failed to
              persist would otherwise be invisible. */}
          {renameError !== null && (
            <ErrorLine
              template={dict.workspace.renameFailed}
              error={renameError}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          )}
          {/* The typed title is deliberately LEFT on screen when this fires, so
              this line is the only thing standing between the user and a title
              they believe is saved. It renders alongside the others, never
              instead of one. */}
          {docTitleError !== null && (
            <ErrorLine
              template={dict.workspace.docTitleFailed}
              error={docTitleError}
              auth={{ expired: dict.common.sessionExpired, signIn: dict.common.signIn }}
            />
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {panelOpen ? (
          <div className="flex w-[290px] flex-none flex-col overflow-hidden rounded-win border border-float-line bg-canvas shadow-pane">
            {detail ? (
              <WorkspaceDetailColumn
                workspace={workspace}
                which={detail}
                openTabs={openTabs}
                onBack={() => setDetail(null)}
                onOpenFile={openTab}
                onCloseFile={closeTab}
              />
            ) : (
              <>
                <div className="flex-none px-4 pb-[15px] pt-3.5">
                  <div className="mb-[15px] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => router.push('/app/workspace')}
                      className="flex items-center gap-1.5 text-[11.5px] text-ink-ghost hover:text-ink"
                    >
                      <ChevronLeftIcon size={13} strokeWidth={1.8} className="rtl:rotate-180" />
                      {dict.workspace.allWorkspaces}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanelOpen(false)}
                      title={dict.workspace.collapsePanel}
                      className={iconBtn}
                    >
                      <CollapseIcon size={16} strokeWidth={1.6} />
                    </button>
                  </div>
                  <div className="flex items-center gap-[11px]">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-panel text-[16px] text-ink">
                      {workspace.initial}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {renaming ? (
                        <input
                          autoFocus
                          defaultValue={name}
                          onBlur={(e) => {
                            if (renameCancelled.current) {
                              renameCancelled.current = false
                              setRenaming(false)
                              return
                            }
                            void commitRename(e.currentTarget.value)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            // Blur rather than unmount, so ONE path commits or
                            // discards. Unmounting straight from here raced the
                            // blur handler and could save what Escape refused.
                            if (e.key === 'Escape') {
                              renameCancelled.current = true
                              e.currentTarget.blur()
                            }
                          }}
                          className="w-full rounded-[7px] border border-hairline bg-canvas px-2 py-1 text-[14px] font-semibold text-ink outline-none"
                        />
                      ) : (
                        <div className="flex min-w-0 items-center gap-1.5">
                          {/* A workspace name is USER INPUT and can itself mix
                              scripts ("Tigbur — הפרטה"). <bdi> rather than
                              dir="auto" so the flip point is the run, not the
                              line — and so this cannot become the 5th occurrence
                              when someone puts a ticker in a Hebrew name. */}
                          <span className="min-w-0 flex-1 truncate font-display text-[16.5px] font-medium leading-[1.2] tracking-[-0.01em] text-ink">
                            <bdi>{name}</bdi>
                          </span>
                          <button
                            type="button"
                            onClick={() => setRenaming(true)}
                            title={dict.workspace.renameWorkspace}
                            className="flex flex-none text-ink-ghost hover:text-ink"
                          >
                            <PencilIcon size={13} strokeWidth={1.7} />
                          </button>
                        </div>
                      )}
                      {/* Same defect as WorkspacePicker's card line, same fix.
                          The review flagged the picker; this copy in the panel
                          header was missed, which is the lesson app.md already
                          files — one flagged occurrence is not the whole set,
                          so this was found by grepping the SHAPE ("} · {"). */}
                      <span className="truncate text-[11.5px] text-ink-ghost">
                        <bdi>{workspace.company}</bdi> · <bdi>{workspace.sub}</bdi>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="atscroll min-h-0 flex-1 overflow-auto px-3.5 pb-4">
                  <button
                    type="button"
                    onClick={() => setChatOpen(true)}
                    className="flex w-full items-center gap-2.5 rounded-[11px] bg-ink px-3 py-[11px] text-start text-paper"
                  >
                    <SparkleIcon size={21} className="flex-none" />
                    {/* "Workspace chat", not "New workspace chat" — founder,
                        2026-08-04. There is one conversation about this
                        workspace, so a "+" promising a fresh one was offering
                        something that does not exist. */}
                    <span className="flex-1 text-[13px] font-semibold">{dict.workspace.workspaceChat}</span>
                  </button>

                  {/* The shelf had no add affordance before migration 016,
                      because nothing could be added. */}
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="mt-2 flex w-full items-center gap-2.5 rounded-[11px] border border-hairline px-3 py-[10px] text-start text-ink transition-colors hover:bg-subtle"
                  >
                    <PlusIcon size={15} strokeWidth={1.9} className="flex-none opacity-60" />
                    <span className="flex-1 text-[13px] font-medium">{dict.workspace.addDocument}</span>
                  </button>

                  <div className="mb-2 ms-0.5 mt-5 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-ghost">
                    {dict.workspace.yourWork}
                  </div>

                  <button
                    type="button"
                    onClick={() => openTab(DOC_TAB)}
                    className={`flex w-full items-center gap-[11px] rounded-xl border px-3 py-[11px] text-start transition-colors ${
                      activeTab === DOC_TAB
                        ? 'border-hairline bg-subtle'
                        : 'border-hairline bg-paper hover:bg-subtle/60'
                    }`}
                  >
                    <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg border border-hairline bg-canvas text-ink-muted">
                      <DocGlyph />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {/* Also user input — same reasoning as the workspace name. */}
                      <span className="truncate text-[13px] font-semibold text-ink">
                        <bdi>{shownDocTitle}</bdi>
                      </span>
                      {/* "Draft", not "saved just now" — nothing saves, and the
                          timestamp was static anyway. */}
                      <span className="text-[11px] text-ink-ghost">{dict.workspace.docDraftMeta}</span>
                    </span>
                  </button>

                  {/* The Legal Due-Diligence row stood here until 2026-08-06.
                      See the LEGAL_TAB note at the top of this file. */}

                  <div className="mb-2 ms-0.5 mt-[22px] text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-ghost">
                    {dict.workspace.workspaceSection}
                  </div>
                  <div className="flex flex-col gap-[3px]">
                    {sections.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setDetail(s.key)}
                        className="flex w-full items-center gap-[11px] rounded-[10px] px-2.5 py-2 text-start hover:bg-subtle/60"
                      >
                        <span className="flex-1 text-[13px] font-medium text-ink">{s.label}</span>
                        <span dir="ltr" className="flex-none font-mono-num text-[11px] text-ink-ghost">
                          {s.count}
                        </span>
                        <ChevronRightIcon
                          size={13}
                          strokeWidth={1.8}
                          className="flex-none text-ink-ghost rtl:rotate-180"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            title={dict.workspace.expandPanel}
            className="flex w-9 flex-none items-center justify-center rounded-win border border-float-line bg-canvas text-ink-ghost shadow-pane hover:text-ink"
          >
            <ChevronRightIcon size={16} strokeWidth={1.8} className="rtl:rotate-180" />
          </button>
        )}

        <WorkspaceDocs
          workspace={workspace}
          openTabs={openTabs}
          activeTab={activeTab}
          split={split}
          multi={multi}
          onSelect={setActiveTab}
          onClose={closeTab}
          onToggleSplit={toggleSplit}
          onToggleMulti={(id) =>
            setMulti((m) => (m.includes(id) ? m.filter((x) => x !== id) : addPane(m, id)))
          }
          maxPanes={MAX_PANES}
          renderSpecial={(id, paneCtl) =>
            id === DOC_TAB ? (
              <WorkingDocument
                workspaceId={workspace.id}
                title={docTitleRaw}
                onRenameDocument={renameDocument}
                onHidePane={paneCtl.onHidePane}
                insert={insertQueue}
                onInserted={(nonce, ok) => {
                  setInsertQueue((q) => q.filter((i) => i.nonce > nonce))
                  // The pane applied it AND saved it — or did not. Either way
                  // the claim comes from the write, not from the queueing.
                  doneWhenIdle(ok ? 'added' : 'failed')
                }}
                incoming={docBusy !== null}
                blocks={docBlocks}
                onSave={saveDocument}
                saveError={docSaveError}
              />
            ) : null
          }
          specialLabel={(id) => (id === DOC_TAB ? shownDocTitle : dict.workspace.workspaceChat)}
          onAskAtlas={(passage) => {
            setAskSeed(passage)
            setChatOpen(true)
          }}
          onConnect={(passage) => {
            // The anchor travels WITH the passage — without it the card can
            // offer to write about the words but not to cite them.
            setConnectDraft(passage)
            setConnectNote('')
          }}
          onStar={() => setChatOpen(true)}
          // With the panel open a marked passage is referenced on the spot, the
          // way the live call does it. The panes need to know, so they are told.
          askOpen={chatOpen}
          snipArm={snipArm}
          onSnip={takeSnip}
          onSnipEnd={() => setSnipArm(0)}
          onSnippable={markSnippable}
        />

        {chatOpen && (
          <div className="flex w-[340px] flex-none flex-col overflow-hidden rounded-win border border-float-line bg-canvas shadow-pane">
            <div className="flex h-[46px] flex-none items-center justify-between gap-2 border-b border-hairline px-3.5">
              {/* SparkleIcon + "Ask Atlas", the same identity the in-call panel
                  carries — it is one feature, so it is named once. */}
              <span className="flex items-center gap-[9px] truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
                <SparkleIcon size={20} className="flex-none" />
                {dict.live.askAtlas}
              </span>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label={dict.common.close}
                className={iconBtn}
              >
                <CloseIcon size={14} strokeWidth={2} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <WorkspaceChat
                workspaceId={workspace.id}
                seed={askSeed}
                onClearSeed={() => setAskSeed(null)}
                // The chat never attaches a file. It hands the request to the
                // add-a-document conversation — the one path that names files
                // and waits for a yes — with the request already typed in.
                onRequestDocuments={(request) => {
                  setAddRequest(request)
                  setAddOpen(true)
                }}
                onConnect={(passage) => {
                  setConnectDraft(passage)
                  setConnectNote('')
                }}
                snips={snips}
                onRemoveSnip={(i) => setSnips((prev) => prev.filter((_, j) => j !== i))}
                onClearSnips={() => setSnips([])}
                snipAvailable={snippable.length > 0}
                onArmSnip={() => setSnipArm((n) => n + 1)}
                snipCapped={snipCapped}
              />
            </div>
          </div>
        )}
      </div>

      {/* THE CLIPPING, ASKING WHERE IT GOES.
          Not a modal: the clip was cut from a page the analyst is still reading,
          and covering that page to ask about it would hide the thing being
          decided. It sits at bottom-24, which is the offset the transcript's
          own "back to current word" chip uses — clear of the docked audio bar
          and of the hidden-bar pill below it. */}
      {clipDraft && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-[560px] flex-col gap-2.5 rounded-win border border-float-line bg-canvas p-3 shadow-pane">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={clipDraft.snip.dataUrl}
                alt=""
                className="h-14 w-20 flex-none rounded-md border border-hairline object-cover"
              />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink">
                  {clipStage === 'where' ? dict.workspace.clipWhere : dict.workspace.clipHow}
                </div>
                {/* Each run its own <bdi>: a Hebrew filing title beside a Latin page run. */}
                <div className="truncate text-[11.5px] text-ink-ghost">
                  <bdi>{clipDraft.title}</bdi> ·{' '}
                  <bdi>{dict.workspace.clipPage.replace('{page}', String(clipDraft.snip.page))}</bdi>
                </div>
              </div>
              <div className="ms-auto flex flex-none items-center gap-1.5">
                {clipStage === 'where' ? (
                  <>
                    <button
                      type="button"
                      onClick={clipToChat}
                      className="flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-subtle"
                    >
                      <SparkleIcon size={14} className="flex-none" />
                      {dict.workspace.clipToChat}
                    </button>
                    {/* ADVANCES, it does not fire. The second question — as an
                        image, as text, as a table, or something typed — only
                        exists once this destination has been chosen. */}
                    <button
                      type="button"
                      onClick={() => setClipStage('how')}
                      className="rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] font-medium text-paper transition-opacity hover:opacity-90"
                    >
                      {dict.workspace.clipToDocument}
                    </button>
                  </>
                ) : (
                  <>
                    {/* The destination is a CHOICE, so it stays changeable —
                        without this, reaching the second question by mistake
                        leaves discarding the clipping as the only way back. */}
                    <button
                      type="button"
                      onClick={() => setClipStage('where')}
                      className="rounded-lg border border-hairline px-2.5 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-subtle"
                    >
                      {dict.workspace.clipBack}
                    </button>
                    <button
                      type="button"
                      onClick={() => clipToDocument(clipNote)}
                      className="rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] font-medium text-paper transition-opacity hover:opacity-90"
                    >
                      {clipNote.trim() ? dict.workspace.clipDoIt : dict.workspace.clipToDocument}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setClipDraft(null)}
                  title={dict.workspace.clipDiscard}
                  aria-label={dict.workspace.clipDiscard}
                  className={iconBtn}
                >
                  <CloseIcon size={14} strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* ═══ WHAT SHOULD ATLAS DO WITH IT ═══
                Founder, 2026-08-05: *"when you are connecting a snipping tool
                into the document, you can also dictate Atlas what to do with it —
                do I want to add it as a screenshot, do I want to extract the data
                from that screenshot and only present it as text, do I want to
                create my own table from it."*

                EMPTY IS THE FAST PATH and stays the default: no instruction, no
                model, the image goes in exactly as it was cut. The three chips
                are the answers he named, written into the same box so a fourth
                one can be typed — they fill the field rather than firing, so what
                is about to happen is always readable before it happens.

                BEHIND THE SECOND STEP since 2026-08-06 (founder), because these
                are options for ONE of the two destinations and were being shown
                under both. */}
            {clipStage === 'how' && (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[dict.workspace.clipAsImage, dict.workspace.clipAsText, dict.workspace.clipAsTable].map(
                    (preset, i) => (
                      <button
                        key={preset}
                        type="button"
                        // The first chip is "as it is": it CLEARS the instruction
                        // rather than describing it, because no instruction is what
                        // makes that path instant.
                        onClick={() => setClipNote(i === 0 ? '' : preset)}
                        className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                          (i === 0 && !clipNote.trim()) || clipNote === preset
                            ? 'border-transparent bg-ink text-paper'
                            : 'border-hairline text-ink-muted hover:bg-subtle'
                        }`}
                      >
                        {preset}
                      </button>
                    )
                  )}
                </div>
                <input
                  value={clipNote}
                  onChange={(e) => setClipNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') clipToDocument(clipNote)
                  }}
                  placeholder={dict.workspace.clipNotePlaceholder}
                  dir="auto"
                  aria-label={dict.workspace.clipNotePlaceholder}
                  className="w-full rounded-lg border border-hairline bg-paper px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-ink-ghost focus:border-ink-ghost"
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ ATLAS, WORKING, WITHOUT TAKING THE SCREEN ═══
          Founder, 2026-08-05: *"it needs to happen in the back … I'll suggest
          adding it to the document, and that's pretty much it."*

          One quiet line at the bottom instead of the old behaviour, which was to
          throw the analyst into the document tab and open an empty "tell Atlas
          what to write" input on top of a request they had just dictated. It
          reports the two things a background job owes you: that it is running,
          and how it ended — with the way IN to what it made, rather than a jump
          you did not ask for. */}
      {(docBusy || docDone) && !clipDraft && (
        <div
          className={`pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4 ${
            barIsUp ? 'bottom-28' : 'bottom-6'
          }`}
        >
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-float-line bg-canvas py-2 ps-3.5 pe-2 text-[12.5px] text-ink shadow-pane"
          >
            {docBusy ? (
              <>
                <SparkleIcon size={14} className="flex-none animate-pulse text-ink-faint" />
                {/* nowrap: this pill can sit under a card that is 280px wide in a
                    four-pane split, and a status broken across three lines is the
                    opposite of quiet. */}
                <span className="whitespace-nowrap">
                  {docBusy === 'clip' ? dict.workspace.docWorkingClip : dict.workspace.docWorking}
                </span>
                <span className="atlas-writing-line w-16 flex-none" aria-hidden />
              </>
            ) : (
              <>
                <span>
                  {docDone === 'added'
                    ? dict.workspace.docAdded
                    : docDone === 'nothing'
                      ? dict.workspace.docWriteNoAnswer
                      : dict.workspace.docFailed}
                </span>
                {/* A DRAFT BUILT FROM PART OF A FILE SAYS SO — the chat already
                    renders this exact signal for the same answer (chatPartial),
                    and the document surface was throwing it away, which is the
                    silent-degradation class rules/app.md keeps filing. */}
                {docDone === 'added' && docPartial.length > 0 && (
                  <span className="max-w-[18rem] truncate text-ink-muted" title={docPartial.join(' · ')}>
                    {dict.workspace.chatPartial}
                  </span>
                )}
                {docDone === 'added' && (
                  <button
                    type="button"
                    onClick={() => {
                      setDocDone(null)
                      openTab(DOC_TAB)
                    }}
                    className="rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-paper"
                  >
                    {dict.workspace.docOpen}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDocDone(null)}
                  aria-label={dict.common.close}
                  className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-ink-ghost hover:bg-subtle hover:text-ink"
                >
                  <CloseIcon size={12} strokeWidth={2.2} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* "Where should this go, and how?" — the one sentence that turns a marked
          passage into a paragraph in the document. */}
      {connectDraft && (
        <div
          className="absolute inset-0 z-40 flex items-start justify-center bg-ink/20 p-8"
          role="dialog"
          aria-modal="true"
          aria-label={dict.workspace.connectToDocument}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConnectDraft(null)
          }}
        >
          <div className="flex w-full max-w-[520px] flex-col gap-3 rounded-win border border-float-line bg-canvas p-5 shadow-pane">
            <div className="flex items-start justify-between gap-4">
              <div className="text-[15px] font-semibold text-ink">{dict.workspace.connectToDocument}</div>
              <button
                type="button"
                onClick={() => setConnectDraft(null)}
                aria-label={dict.common.close}
                className={iconBtn}
              >
                <CloseIcon size={14} strokeWidth={2} />
              </button>
            </div>
            <div
              dir={detectDir(connectDraft.text)}
              className="max-h-[160px] overflow-auto rounded-[10px] border border-hairline bg-subtle/60 px-3 py-2.5"
            >
              <div className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-ghost">
                <bdi>{connectDraft.title}</bdi>
              </div>
              <p className="text-[12.5px] leading-[1.8] text-ink-muted">{connectDraft.text}</p>
            </div>
            <input
              autoFocus
              value={connectNote}
              onChange={(e) => setConnectNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') connectToDocument()
              }}
              placeholder={dict.workspace.connectPlaceholder}
              dir="auto"
              className="w-full rounded-[10px] border border-hairline bg-paper px-3 py-2.5 text-[13.5px] text-ink outline-none placeholder:text-ink-ghost"
            />
            {/* TWO DIFFERENT THINGS, SIDE BY SIDE, AND THE DIFFERENCE IS THE
                POINT. "Quote it" puts the analyst's own selected words in the
                document, exactly, with the file and the line they came from —
                no model, so no paraphrase can arrive where a quotation was
                asked for. The other asks Atlas to WRITE from the passage, which
                produces Atlas's words. Evidence and prose are not the same act,
                so they are not the same button. */}
            <div className="flex items-center justify-end gap-2">
              {connectDraft.itemId && (
                <button
                  type="button"
                  onClick={quoteIntoDocument}
                  className="rounded-lg border border-hairline px-3.5 py-2 text-[13px] font-medium text-ink hover:bg-subtle"
                >
                  {dict.workspace.connectQuote}
                </button>
              )}
              <button
                type="button"
                disabled={!connectNote.trim()}
                onClick={connectToDocument}
                className="rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-paper disabled:opacity-40"
              >
                {dict.workspace.connectTo}
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <div
          className="absolute inset-0 z-30 flex items-start justify-center bg-ink/20 p-8"
          role="dialog"
          aria-modal="true"
          aria-label={dict.workspace.addDocument}
          onMouseDown={(e) => {
            // Backdrop only — a mousedown that started inside the panel must not
            // close it when the pointer is released over the backdrop.
            // CLOSING CLEARS THE REQUEST IT WAS OPENED WITH. Leaving it set made
            // the NEXT "Add a document" — the manual one, from the shelf — open
            // already carrying the previous chat's sentence and send it as a
            // message the analyst never typed.
            if (e.target === e.currentTarget) closeAddDialog()
          }}
        >
          <div className="flex h-[520px] max-h-full w-full max-w-[560px] flex-col gap-2 overflow-hidden rounded-win border border-float-line bg-canvas p-5 shadow-pane">
            <div className="flex flex-none items-start justify-between gap-4">
              <div className="text-[15px] font-semibold text-ink">{dict.workspace.addDocument}</div>
              <button
                type="button"
                onClick={closeAddDialog}
                aria-label={dict.common.close}
                className="flex-none rounded-[7px] px-2 py-1 text-ink-ghost hover:bg-subtle hover:text-ink"
              >
                <CloseIcon size={14} strokeWidth={2} />
              </button>
            </div>
            {/* THE SAME CONVERSATION THAT FILLED THE WORKSPACE, not a grid of
                checkboxes. WorkspaceSourcePicker used to live here and is gone
                — see WorkspaceRoute for why it was deleted rather than kept
                around unreachable. */}
            <div className="min-h-0 flex-1">
              <WorkspaceIntake
                workspaceId={workspace.id}
                workspaceName={name}
                variant="panel"
                initialRequest={addRequest}
                onDone={closeAddDialog}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DocGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden
    >
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  )
}
