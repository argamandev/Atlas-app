'use client'

import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { PlusIcon, AtIcon, SlashIcon, ArrowUpIcon, CloseIcon } from '@/components/ds/icons'
import { cn, detectDir } from '@/lib/utils'

// Chat composer (brief §5.3.1). When a `reference` (a quoted transcript excerpt) is present it
// becomes a nested, Claude-style container: an outer GREY sleeve holds the reference header (no
// separator line — it sits straight on the grey), and the white input area is an inset rounded
// CARD resting inside that sleeve, so the grey visibly hugs its shoulders/sides/bottom. Without a
// reference it stays the plain white composer (no grey frame). The input row (+/@/⊘ icons +
// circular send) is unchanged. RTL-correct via detectDir + logical properties.
export function ChatComposer({
  value,
  onChange,
  onSend,
  onAt,
  onKeyDownCapture,
  inputRef,
  reference,
  onRemoveReference,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onAt: () => void
  onKeyDownCapture?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  inputRef?: React.RefObject<HTMLTextAreaElement>
  /** a referenced transcript quote → shown as the header above the white input card */
  reference?: string | null
  onRemoveReference?: () => void
}) {
  const { dict } = useI18n()
  const localRef = useRef<HTMLTextAreaElement>(null)
  const ref = inputRef ?? localRef
  const hasContent = value.trim().length > 0

  // auto-grow
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value, ref])

  // The white input area — shared between the plain (no-reference) and nested (sleeve) layouts.
  const inputArea = (
    <>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDownCapture={onKeyDownCapture}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
        placeholder={dict.chat.askAnything}
        className="block max-h-[200px] w-full resize-none bg-transparent px-1 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
      />
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Add"
            className="grid h-[30px] w-[30px] place-items-center rounded-lg text-ghost transition-colors hover:bg-subtle hover:text-ink"
          >
            <PlusIcon size={16} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={onAt}
            aria-label="Mention"
            className="grid h-[30px] w-[30px] place-items-center rounded-lg text-ghost transition-colors hover:bg-subtle hover:text-ink"
          >
            <AtIcon size={16} />
          </button>
          <button
            type="button"
            aria-label="Commands"
            className="grid h-6 w-[26px] place-items-center rounded-[7px] border border-field-line text-xs text-ghost transition-colors hover:text-ink"
          >
            <SlashIcon size={12} />
          </button>
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={!hasContent}
          aria-label="Send"
          className={`grid h-[34px] w-[34px] place-items-center rounded-[10px] transition-colors ${
            hasContent ? 'bg-ink text-paper hover:bg-black' : 'bg-send-idle text-ghost'
          }`}
        >
          <ArrowUpIcon size={16} strokeWidth={2} />
        </button>
      </div>
    </>
  )

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[18px] border border-field-line bg-field transition-shadow focus-within:border-[#C9C9C9] focus-within:shadow-[0_0_0_3px_rgba(214,205,187,0.28)]'
      )}
    >
      {reference && (
        // Reference row — native-Claude style: flat, white, separated from the input by a faint
        // 1px hairline (NOT a grey sleeve or a puffy floating card). The excerpt is wrapped in an
        // opening + closing quote; in Hebrew RTL the opening sits on the right, the closing on the left.
        <div
          dir={detectDir(reference)}
          className="flex items-start gap-2 border-b border-hairline px-3.5 py-2.5"
        >
          <p className="line-clamp-3 flex-1 text-[13px] leading-relaxed text-ink-muted">
            {'"'}
            {reference}
            {'"'}
          </p>
          {onRemoveReference && (
            <button
              type="button"
              onClick={onRemoveReference}
              aria-label={dict.common.close}
              className="-mt-0.5 shrink-0 rounded-md p-0.5 text-ink-faint transition-colors hover:bg-black/5 hover:text-ink"
            >
              <CloseIcon size={15} />
            </button>
          )}
        </div>
      )}
      <div className="px-4 pb-3 pt-4">{inputArea}</div>
    </div>
  )
}
