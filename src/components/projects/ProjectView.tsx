'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import {
  PlusIcon,
  PencilIcon,
  StarIcon,
  SearchIcon,
  ChatIcon,
  ArrowUpIcon,
  AtIcon,
} from '@/components/ds/icons'
import type { Project } from '@/lib/projects/data'
import { presentProject, presentChats } from '@/lib/projects/present'
import { fetchProject, patchProjectReq, addSourceReq, patchSourceReq } from '@/lib/projects/client'

// A project (design lines 1123-1258): breadcrumb + title row, main column
// (composer → RECENTS list) and the right rail (Instructions / Memory / Context).
//
// Real rows since 2026-08-02. Every label on this screen — memWhen, the source
// line counts, the chat timestamps, the capacity meter — is DERIVED from
// columns by present.ts. Nothing here stores a label.

// Everything is a typed note this chapter; the badge is the only kind there is.
const KIND_STYLE = 'text-ink-faint bg-panel'

type Editing = { kind: 'instructions' | 'memory' } | { kind: 'source'; id: string } | null

export function ProjectView({ projectId }: { projectId: string }) {
  const { dict, locale } = useI18n()
  const router = useRouter()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  // A 404 and a 500 are different truths. "This project belongs to another
  // account" is a LIE when the real cause is the server failing, so the two
  // are kept apart rather than both collapsing into the not-found screen.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [renaming, setRenaming] = useState(false)
  // A failed write must be SEEN. Nothing on this screen claims success.
  const [saveError, setSaveError] = useState<string | null>(null)

  const instrRef = useRef<HTMLTextAreaElement>(null)
  const memRef = useRef<HTMLTextAreaElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      const { project: row, sources, chats } = await fetchProject(projectId)
      const now = new Date()
      setProject(presentProject(row, sources, presentChats(chats, now, locale), now, locale, dict))
      setSaveError(null)
      setLoadError(null)
    } catch (e) {
      setProject(null)
      const msg = (e as Error).message
      // Only a genuine "not found" earns the not-found screen; anything else
      // is reported as what it is.
      setLoadError(/not found/i.test(msg) ? null : msg)
    } finally {
      setLoading(false)
    }
  }, [projectId, locale, dict])

  useEffect(() => {
    void load()
  }, [load])

  /** Runs a write, reloads on success, and SHOWS the failure on error. */
  const write = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      setSaveError(null)
      setEditing(null)
      setRenaming(false)
      await load()
    } catch (e) {
      setSaveError((e as Error).message)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <p className="text-[13px] text-ink-ghost">{dict.common.loading}</p>
      </div>
    )
  }

  // Never render a silent blank. An unknown id means a stale link, a removed
  // project, or one belonging to another account — RLS returns no row, which is
  // the correct answer (rules/app.md — degradation must be VISIBLE).
  if (!project) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
          <p className="text-[15px] text-ink">{loadError ? dict.common.error : dict.projects.notFound}</p>
          <p
            dir="auto"
            className={`max-w-[420px] text-[13px] leading-[1.6] ${loadError ? 'text-[#B0533E]' : 'text-ink-muted'}`}
          >
            {loadError
              ? dict.projects.loadOneFailed.replace('{error}', loadError)
              : dict.projects.notFoundHint}
          </p>
          <button
            type="button"
            onClick={() => router.push('/app/chat/projects')}
            className="mt-1 rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-paper"
          >
            {dict.projects.backToProjects}
          </button>
        </div>
      </div>
    )
  }

  const saveInstructions = () =>
    write(() => patchProjectReq(project.id, { instructions: (instrRef.current?.value ?? '').trim() }))
  const saveMemory = () =>
    write(() => patchProjectReq(project.id, { memory: (memRef.current?.value ?? '').trim() }))
  const saveSourceBody = (sourceId: string) =>
    write(() => patchSourceReq(project.id, sourceId, { body: bodyRef.current?.value ?? '' }))
  const addContext = () =>
    write(() =>
      addSourceReq(project.id, dict.projects.newSource.replace('{n}', String(project.context.length + 1)))
    )

  const cardBtn =
    'flex h-[26px] w-[26px] flex-none items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-subtle hover:text-ink'
  const editActions = (onSave: () => void) => (
    <div className="mt-2 flex justify-end gap-[7px]">
      <button
        type="button"
        onClick={() => setEditing(null)}
        className="rounded-[7px] px-2.5 py-[5px] text-[12px] text-ink-muted hover:bg-subtle"
      >
        {dict.common.cancel}
      </button>
      <button
        type="button"
        onClick={onSave}
        className="rounded-[7px] bg-ink px-3 py-[5px] text-[12px] font-semibold text-paper"
      >
        {dict.common.save}
      </button>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="atscroll min-h-0 flex-1 overflow-auto px-10 pb-32 pt-[26px]">
        <div className="mx-auto max-w-[1080px]">
          {/* breadcrumb */}
          <div className="mb-5 flex items-center gap-2 text-[12px] text-ink-ghost">
            <button
              type="button"
              onClick={() => router.push('/app/chat/projects')}
              className="text-[12px] font-medium text-ink-muted hover:text-ink"
            >
              {dict.projects.title}
            </button>
            <span aria-hidden>/</span>
            <span dir="auto" className="text-ink">
              {project.name}
            </span>
          </div>

          {saveError && (
            <div
              dir="auto"
              role="alert"
              className="mb-4 rounded-[9px] border border-hairline bg-paper px-3 py-2 text-[12.5px] leading-[1.5] text-[#B0533E]"
            >
              {dict.projects.saveFailed.replace('{error}', saveError)}
            </div>
          )}

          {/* title row */}
          <div className="mb-[22px] flex items-start justify-between gap-5">
            {renaming ? (
              <input
                autoFocus
                defaultValue={project.name}
                onBlur={(e) => {
                  const next = e.currentTarget.value.trim()
                  if (next && next !== project.name)
                    void write(() => patchProjectReq(project.id, { name: next }))
                  else setRenaming(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setRenaming(false)
                }}
                placeholder={dict.projects.namePlaceholder}
                className="min-w-0 flex-1 rounded-[10px] border border-hairline bg-canvas px-3 py-1.5 font-display text-[32px] font-medium tracking-[-0.02em] text-ink outline-none"
              />
            ) : (
              <h1
                dir="auto"
                className="min-w-0 flex-1 font-display text-[34px] font-medium leading-[1.1] tracking-[-0.022em] text-ink"
              >
                {project.name}
              </h1>
            )}
            <div className="flex flex-none items-center gap-0.5 pt-[5px]">
              <button
                type="button"
                title={dict.projects.rename}
                onClick={() => setRenaming(true)}
                className={cardBtn}
              >
                <PencilIcon size={16} strokeWidth={1.7} />
              </button>
              <button
                type="button"
                title={dict.projects.pin}
                onClick={() => void write(() => patchProjectReq(project.id, { pinned: !project.pinned }))}
                className={`${cardBtn} ${project.pinned ? 'text-ink' : ''}`}
              >
                <StarIcon size={16} strokeWidth={1.7} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-6">
            {/* main column */}
            <div className="min-w-[340px] flex-[1_1_520px]">
              <div className="rounded-2xl border border-hairline bg-paper px-4 pb-[11px] pt-[15px]">
                {/* The composer stays inert: project chat is not wired up yet, and
                    the title says exactly that on the WRAPPER — Chrome never fires
                    hover on a disabled control, so a title= on the textarea itself
                    would be an unreachable explanation. */}
                <span title={dict.projects.composerDisabled}>
                  <textarea
                    rows={1}
                    dir="auto"
                    disabled
                    aria-disabled="true"
                    placeholder={dict.projects.composerPlaceholder.replace('{name}', project.name)}
                    className="min-h-[44px] w-full resize-none bg-transparent text-[15px] leading-[1.5] text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
                  />
                </span>
                <div className="mt-1.5 flex items-center gap-0.5">
                  <span className={cardBtn} aria-hidden>
                    <PlusIcon size={15} strokeWidth={1.5} />
                  </span>
                  <span className={cardBtn} aria-hidden>
                    <AtIcon size={15} strokeWidth={1.5} />
                  </span>
                  <span className="flex-1" />
                  <span className="me-2 text-[11.5px] text-ink-ghost">
                    {dict.projects.sourcesInContext.replace('{count}', String(project.context.length))}
                  </span>
                  <span
                    aria-hidden
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-send-idle text-canvas"
                  >
                    <ArrowUpIcon size={15} strokeWidth={2} />
                  </span>
                </div>
              </div>

              <div className="mb-1 mt-[26px] flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-ghost">
                  {dict.projects.recents}
                </span>
                <span className="font-mono-num text-[11px] text-ink-ghost" dir="ltr">
                  {project.chats.length}
                </span>
              </div>

              <div className="flex flex-col">
                {project.chats.map((c) => (
                  <div
                    key={c.id}
                    className="flex w-full items-center gap-[13px] border-b border-hairline px-2 py-3.5 text-start"
                  >
                    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-subtle text-ink-faint">
                      <ChatIcon size={14} strokeWidth={1.7} />
                    </span>
                    <span dir="auto" className="min-w-0 flex-1 truncate text-[14px] text-ink" title={c.title}>
                      {c.title}
                    </span>
                    <span className="flex-none text-[11.5px] text-ink-ghost">
                      <bdi dir="auto">{c.when}</bdi>
                    </span>
                  </div>
                ))}
                {project.chats.length === 0 && (
                  <div className="rounded-xl border border-dashed border-hairline p-7 text-center text-[13px] leading-[1.6] text-ink-ghost">
                    {dict.projects.noChats}
                    <br />
                    {dict.projects.noChatsHint}
                  </div>
                )}
              </div>
            </div>

            {/* right rail */}
            <div className="min-w-[290px] max-w-[360px] flex-[1_1_320px]">
              <div className="overflow-hidden rounded-[14px] border border-hairline bg-canvas shadow-hairlift">
                {/* Instructions */}
                <div className="border-b border-hairline px-4 py-[15px]">
                  <div className="mb-2 flex items-center justify-between gap-2.5">
                    <span className="text-[13.5px] font-semibold text-ink">{dict.projects.instructions}</span>
                    <button
                      type="button"
                      title={dict.projects.editInstructions}
                      onClick={() => setEditing({ kind: 'instructions' })}
                      className={cardBtn}
                    >
                      <PencilIcon size={14} strokeWidth={1.7} />
                    </button>
                  </div>
                  {editing?.kind === 'instructions' ? (
                    <>
                      <textarea
                        ref={instrRef}
                        autoFocus
                        defaultValue={project.instructions}
                        placeholder={dict.projects.instructionsPlaceholder}
                        className="min-h-[80px] w-full resize-y rounded-[9px] border border-hairline bg-paper px-2.5 py-[9px] text-[12.5px] leading-[1.6] text-ink outline-none"
                      />
                      {editActions(saveInstructions)}
                    </>
                  ) : (
                    <div
                      dir="auto"
                      className={`whitespace-pre-wrap text-[12.5px] leading-[1.6] ${project.instructions ? 'text-ink-muted' : 'text-ink-ghost'}`}
                    >
                      {project.instructions || dict.projects.instructionsEmpty}
                    </div>
                  )}
                </div>

                {/* Memory */}
                <div className="border-b border-hairline px-4 py-[15px]">
                  <div className="mb-2 flex items-center justify-between gap-2.5">
                    <span className="text-[13.5px] font-semibold text-ink">{dict.projects.memory}</span>
                    <span className="flex items-center gap-1">
                      <span className="flex items-center gap-[5px] rounded-md bg-subtle px-2 py-[3px] text-[11px] text-ink-muted">
                        <LockGlyph />
                        {dict.projects.onlyYou}
                      </span>
                      <button
                        type="button"
                        title={dict.projects.editMemory}
                        onClick={() => setEditing({ kind: 'memory' })}
                        className={cardBtn}
                      >
                        <PencilIcon size={14} strokeWidth={1.7} />
                      </button>
                    </span>
                  </div>
                  {editing?.kind === 'memory' ? (
                    <>
                      <textarea
                        ref={memRef}
                        autoFocus
                        defaultValue={project.memory}
                        placeholder={dict.projects.memoryPlaceholder}
                        className="min-h-[96px] w-full resize-y rounded-[9px] border border-hairline bg-paper px-2.5 py-[9px] text-[12.5px] leading-[1.6] text-ink outline-none"
                      />
                      {editActions(saveMemory)}
                    </>
                  ) : (
                    <>
                      <div
                        dir="auto"
                        className={`line-clamp-3 whitespace-pre-wrap text-[12.5px] leading-[1.6] ${project.memory ? 'text-ink-muted' : 'text-ink-ghost'}`}
                      >
                        {project.memory || dict.projects.memoryEmpty}
                      </div>
                      {/* memWhen is a localized sentence, not a numeral — no dir="ltr". */}
                      <div dir="auto" className="mt-[7px] text-[11px] text-ink-ghost">
                        {project.memWhen}
                      </div>
                    </>
                  )}
                </div>

                {/* Context */}
                <div className="px-4 py-[15px]">
                  <div className="mb-2.5 flex items-center justify-between gap-2.5">
                    <span className="text-[13.5px] font-semibold text-ink">{dict.projects.context}</span>
                    <span className="flex items-center gap-0.5">
                      <span className={cardBtn} title={dict.projects.searchContext} aria-hidden>
                        <SearchIcon size={14} strokeWidth={1.8} />
                      </span>
                      <button
                        type="button"
                        title={dict.projects.addContext}
                        onClick={addContext}
                        className={cardBtn}
                      >
                        <PlusIcon size={15} strokeWidth={1.9} />
                      </button>
                    </span>
                  </div>

                  <div className="h-1 overflow-hidden rounded bg-subtle">
                    <div
                      className={`h-full rounded ${project.overBudget ? 'bg-[#B0533E]' : 'bg-ink'}`}
                      style={{ width: `${Math.max(2, project.capacity)}%` }}
                    />
                  </div>
                  <div className="mb-3 mt-2 text-[11.5px] text-ink-ghost">
                    {dict.projects.capacityUsed.replace('{pct}', String(project.capacity))}
                  </div>
                  {/* A full bar looks the same at the limit and ten times past it.
                      Only one of those is losing the user's context — say which. */}
                  {project.overBudget && (
                    <div
                      dir="auto"
                      role="alert"
                      className="mb-3 rounded-[8px] bg-[rgba(203,75,46,.10)] px-2.5 py-2 text-[11.5px] leading-[1.5] text-[#B0533E]"
                    >
                      {dict.projects.overBudget}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-[9px]">
                    {project.context.map((cx) => (
                      <div
                        key={cx.id}
                        className="col-span-2 flex flex-col gap-[5px] rounded-[10px] border border-hairline bg-paper px-[11px] pb-[9px] pt-[11px]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span dir="auto" className="text-[12.5px] font-semibold leading-[1.35] text-ink">
                            {cx.name}
                          </span>
                          <button
                            type="button"
                            title={dict.projects.editSource}
                            onClick={() => setEditing({ kind: 'source', id: cx.id })}
                            className={cardBtn}
                          >
                            <PencilIcon size={13} strokeWidth={1.7} />
                          </button>
                        </div>

                        {editing?.kind === 'source' && editing.id === cx.id ? (
                          <>
                            <textarea
                              ref={bodyRef}
                              autoFocus
                              dir="auto"
                              defaultValue={cx.body}
                              placeholder={dict.projects.sourceBodyPlaceholder}
                              className="min-h-[90px] w-full resize-y rounded-[9px] border border-hairline bg-canvas px-2.5 py-[9px] text-[12px] leading-[1.6] text-ink outline-none"
                            />
                            {editActions(() => saveSourceBody(cx.id))}
                          </>
                        ) : (
                          <>
                            {cx.body && (
                              <span
                                dir="auto"
                                className="line-clamp-3 whitespace-pre-wrap text-[11.5px] leading-[1.55] text-ink-muted"
                              >
                                {cx.body}
                              </span>
                            )}
                            {/* meta may lead with a digit ("6 lines"); isolate the run
                                so RTL does not throw the number to the end. */}
                            <span className="text-[11px] text-ink-ghost">
                              <bdi dir="auto">{cx.meta}</bdi>
                            </span>
                            <span
                              dir="ltr"
                              className={`self-start rounded-[5px] px-1.5 py-[3px] font-mono-num text-[9.5px] tracking-[0.06em] ${KIND_STYLE}`}
                            >
                              {cx.kind}
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                    {project.context.length === 0 && (
                      <button
                        type="button"
                        onClick={addContext}
                        className="col-span-2 rounded-[10px] border border-dashed border-hairline p-[18px] text-[12px] text-ink-ghost hover:bg-subtle/60"
                      >
                        {dict.projects.addContextEmpty}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LockGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 018 0v3.5" />
    </svg>
  )
}
