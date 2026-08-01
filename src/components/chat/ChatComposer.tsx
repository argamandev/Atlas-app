'use client'

import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { PlusIcon, AtIcon, SlashIcon, ArrowUpIcon, CloseIcon, MicIcon } from '@/components/ds/icons'
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
  variant = 'tall',
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
  /**
   * 'tall' (default) is the composer every existing caller renders.
   * 'pill' is the founder's 2026-08-01 shape for a conversation that has already
   * started — one fully-rounded bar. A pending `reference` always falls back to
   * 'tall', because the quote header needs the box to sit on.
   */
  variant?: 'tall' | 'pill'
}) {
  const { dict } = useI18n()
  const localRef = useRef<HTMLTextAreaElement>(null)
  const ref = inputRef ?? localRef
  const hasContent = value.trim().length > 0
  const pill = variant === 'pill' && !reference

  // auto-grow — the pill is a fixed-height bar, so it must not run there
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (pill) {
      // drop any height the tall layout measured, or it survives the switch
      el.style.height = ''
      return
    }
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value, ref, pill])

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
          // MUST stay a wrapper, never `onClick={onSend}`: callers here are
          // `send(explicit?: string)`, so passing the handler directly hands
          // React's MouseEvent in as `explicit` and `(explicit ?? input).trim()`
          // throws inside the click — swallowed, so the button silently does
          // nothing. That was live on main; keyboard Enter masked it.
          onClick={() => onSend()}
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

  // Pill: one fully-rounded bar. The @ and / buttons are gone by design — both
  // characters are still typed straight into the input, and the mention dropdown
  // still fires from onChange, so nothing about mentions changes here.
  if (pill) {
    return (
      <div className="flex h-[46px] w-full items-center gap-2.5 rounded-full border border-field-line bg-paper ps-[15px] pe-[7px] shadow-soft transition-shadow focus-within:border-[#C9C9C9] focus-within:shadow-[0_0_0_3px_rgba(201,201,201,0.28)]">
        <button
          type="button"
          aria-label="Add"
          className="flex flex-none text-ghost transition-colors hover:text-ink"
        >
          <PlusIcon size={18} strokeWidth={1.7} />
        </button>
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
          className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-[14.5px] leading-[22px] text-ink outline-none placeholder:text-ink-faint"
        />
        <button
          type="button"
          aria-label="Dictate"
          className="flex flex-none text-ink-faint transition-colors hover:text-ink"
        >
          <MicIcon size={17} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          // wrapper, not a bare `onSend` — see the tall composer's send button
          onClick={() => onSend()}
          aria-label="Send"
          // solid at all times in the pill, per the design — unlike the tall
          // composer above, which greys out until there is something to send
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ink text-paper transition-colors hover:bg-black"
        >
          <ArrowUpIcon size={15} strokeWidth={2} />
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[18px] border border-field-line bg-field transition-shadow focus-within:border-[#C9C9C9] focus-within:shadow-[0_0_0_3px_rgba(201,201,201,0.28)]'
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
