'use client'

import { useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Monogram } from '@/components/ds/Monogram'
import { SearchIcon, PlusIcon, ChevronDownIcon } from '@/components/ds/icons'
import type { Workspace } from '@/lib/workspace/data'

// Workspace picker — EXACT design anatomy (design lines 1066-1136): 34px header +
// sort + solid black "New workspace" button, explainer, 44px search, 3-column card
// grid. (The old dashed new-workspace card was NOT in the design — removed.)
export function WorkspacePicker({ workspaces }: { workspaces: Workspace[] }) {
  const { dict } = useI18n()
  const [q, setQ] = useState('')

  const visible = workspaces.filter((w) =>
    (w.name + ' ' + w.subtitle).toLowerCase().includes(q.trim().toLowerCase())
  )

  return (
    <div className="atscroll flex-1 overflow-y-auto px-12 pb-[120px] pt-11">
      <div className="mx-auto w-full max-w-[960px]">
        {/* header row (design lines 1071-1092) */}
        <div className="flex items-start justify-between gap-5">
          <h1 className="text-[34px] font-semibold tracking-[-0.02em] text-ink">{dict.workspace.title}</h1>
          <div className="flex flex-none items-center gap-4 pt-[5px]">
            <button
              type="button"
              className="flex items-center gap-[5px] text-[14px] text-[#6B6862] transition-colors hover:text-ink"
            >
              {dict.workspace.sortNewest}
              <ChevronDownIcon size={14} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              className="flex items-center gap-[7px] rounded-[10px] bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper transition-opacity hover:opacity-90"
            >
              <PlusIcon size={15} strokeWidth={1.9} />
              {dict.workspace.newWorkspace}
            </button>
          </div>
        </div>
        <p className="mb-[22px] mt-2 max-w-[620px] text-[14px] text-[#6B6862]">{dict.workspace.subtitle}</p>

        {/* search (design lines 1096-1099) */}
        <div className="relative mb-[22px]">
          <SearchIcon
            size={17}
            strokeWidth={1.6}
            className="absolute top-1/2 -translate-y-1/2 text-ink opacity-40 ltr:left-[15px] rtl:right-[15px]"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={dict.workspace.searchPlaceholder}
            className="h-11 w-full rounded-[10px] border border-[#E6E2DA] bg-shell text-[14.5px] text-ink outline-none placeholder:text-ink-faint ltr:pl-[42px] ltr:pr-4 rtl:pl-4 rtl:pr-[42px]"
          />
        </div>

        {/* grid (design lines 1102-1118) */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((w) => (
            <button
              key={w.id}
              type="button"
              className="flex min-h-[152px] flex-col gap-3.5 rounded-card border border-[#E6E2DA] bg-shell p-[18px] text-start"
            >
              <div className="flex items-center justify-between">
                <Monogram name={w.initial} size={38} fontSize={16} radius={9} />
                <span className="font-mono-num text-[11px] text-[#9A968C]" dir="ltr">
                  {w.updatedLabel}
                </span>
              </div>
              <div className="flex-1">
                <div className="mb-[3px] text-[15px] font-semibold tracking-[-0.01em] text-ink" dir="auto">
                  {w.name}
                </div>
                <div className="text-[12.5px] text-[#6B6862]" dir="auto">
                  {w.subtitle}
                </div>
              </div>
              <div className="font-mono-num text-[11.5px] text-[#8A867C]" dir="ltr">
                {w.fileCount} {dict.workspace.files}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
