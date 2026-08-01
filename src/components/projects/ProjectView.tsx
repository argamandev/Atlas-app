'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { useDemoState } from '@/lib/demo/DemoStateProvider'
import { DemoBanner } from '@/components/ds/DemoBanner'
import {
  PlusIcon,
  PencilIcon,
  StarIcon,
  SearchIcon,
  ChatIcon,
  ArrowUpIcon,
  AtIcon,
} from '@/components/ds/icons'
import type { ContextItem } from '@/lib/projects/data'

// A project (design lines 1123-1258): breadcrumb + title row, main column
// (composer → RECENTS list) and the right rail (Instructions / Memory / Context).
// Editing is session-only and resets on reload — see DemoStateProvider.

const KIND_STYLE: Record<ContextItem['kind'], string> = {
  XLSX: 'text-[#4F7A52] bg-[rgba(79,122,82,.11)]',
  PDF: 'text-[#9C6B4E] bg-[rgba(156,107,78,.12)]',
  TEXT: 'text-ink-faint bg-panel',
}

export function ProjectView({ projectId }: { projectId: string }) {
  const { dict } = useI18n()
  const router = useRouter()
  const { projects, patchProject } = useDemoState()
  const project = projects.find((p) => p.id === projectId)

  const [editing, setEditing] = useState<'instructions' | 'memory' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const instrRef = useRef<HTMLTextAreaElement>(null)
  const memRef = useRef<HTMLTextAreaElement>(null)

  // Never render a silent blank: an unknown id means a stale link, or a project
  // created in a previous session that reload cleared (rules/app.md — degradation
  // must be VISIBLE).
  if (!project) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <DemoBanner />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
          <p className="text-[15px] text-ink">{dict.projects.notFound}</p>
          <p className="max-w-[420px] text-[13px] leading-[1.6] text-ink-muted">
            {dict.projects.notFoundHint}
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

  const saveInstructions = () => {
    patchProject(project.id, { instructions: (instrRef.current?.value ?? '').trim() })
    setEditing(null)
  }
  const saveMemory = () => {
    patchProject(project.id, {
      memory: (memRef.current?.value ?? '').trim(),
      memWhen: dict.projects.memoryJustUpdated,
    })
    setEditing(null)
  }
  const addContext = () => {
    const n = project.context.length + 1
    patchProject(project.id, {
      context: [
        ...project.context,
        {
          name: dict.projects.newSource.replace('{n}', String(n)),
          meta: dict.projects.newSourceMeta,
          kind: 'TEXT',
        },
      ],
      capacity: Math.min(100, project.capacity + 6),
    })
  }

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
      <DemoBanner />
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

          {/* title row */}
          <div className="mb-[22px] flex items-start justify-between gap-5">
            {renaming ? (
              <input
                autoFocus
                defaultValue={project.name}
                onBlur={(e) => {
                  const next = e.currentTarget.value.trim()
                  if (next) patchProject(project.id, { name: next })
                  setRenaming(false)
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
                onClick={() => patchProject(project.id, { pinned: !project.pinned })}
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
                <textarea
                  rows={1}
                  dir="auto"
                  disabled
                  aria-disabled="true"
                  title={dict.projects.composerDisabled}
                  placeholder={dict.projects.composerPlaceholder.replace('{name}', project.name)}
                  className="min-h-[44px] w-full resize-none bg-transparent text-[15px] leading-[1.5] text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
                />
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
                    key={c.title}
                    className="flex w-full items-center gap-[13px] border-b border-hairline px-2 py-3.5 text-start"
                  >
                    <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-subtle text-ink-faint">
                      <ChatIcon size={14} strokeWidth={1.7} />
                    </span>
                    <span dir="auto" className="min-w-0 flex-1 truncate text-[14px] text-ink" title={c.title}>
                      {c.title}
                    </span>
                    <span className="flex-none font-mono-num text-[11.5px] text-ink-ghost" dir="ltr">
                      {c.when}
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
                      onClick={() => setEditing('instructions')}
                      className={cardBtn}
                    >
                      <PlusIcon size={15} strokeWidth={1.9} />
                    </button>
                  </div>
                  {editing === 'instructions' ? (
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
                      className={`text-[12.5px] leading-[1.6] ${project.instructions ? 'text-ink-muted' : 'text-ink-ghost'}`}
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
                        onClick={() => setEditing('memory')}
                        className={cardBtn}
                      >
                        <PencilIcon size={14} strokeWidth={1.7} />
                      </button>
                    </span>
                  </div>
                  {editing === 'memory' ? (
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
                        className={`line-clamp-3 text-[12.5px] leading-[1.6] ${project.memory ? 'text-ink-muted' : 'text-ink-ghost'}`}
                      >
                        {project.memory || dict.projects.memoryEmpty}
                      </div>
                      <div className="mt-[7px] text-[11px] text-ink-ghost">{project.memWhen}</div>
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
                      className="h-full rounded bg-ink"
                      style={{ width: `${Math.max(2, project.capacity)}%` }}
                    />
                  </div>
                  <div className="mb-3 mt-2 text-[11.5px] text-ink-ghost">
                    {dict.projects.capacityUsed.replace('{pct}', String(project.capacity))}
                  </div>

                  <div className="grid grid-cols-2 gap-[9px]">
                    {project.context.map((cx) => (
                      <div
                        key={cx.name}
                        className="flex min-h-[96px] flex-col gap-[5px] rounded-[10px] border border-hairline bg-paper px-[11px] pb-[9px] pt-[11px]"
                      >
                        <span dir="auto" className="text-[12.5px] font-semibold leading-[1.35] text-ink">
                          {cx.name}
                        </span>
                        {/* meta is Latin with a leading digit ("4 sheets"); under dir=rtl the
                            number jumps to the end. <bdi dir="ltr"> isolates the run so it reads
                            correctly while the card's own alignment stays with the locale. */}
                        <span className="text-[11px] text-ink-ghost">
                          <bdi dir="ltr">{cx.meta}</bdi>
                        </span>
                        <span className="flex-1" />
                        <span
                          dir="ltr"
                          className={`self-start rounded-[5px] px-1.5 py-[3px] font-mono-num text-[9.5px] tracking-[0.06em] ${KIND_STYLE[cx.kind]}`}
                        >
                          {cx.kind}
                        </span>
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
