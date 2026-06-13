'use client'

import { useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { Surface } from '@/components/ds/Surface'
import { PlusIcon, AtIcon, SlashIcon, ArrowUpIcon } from '@/components/ds/icons'

// Chat composer (brief §5.3.1): white rounded surface, soft shadow, no border. Two rows —
// growable "Ask anything" textarea on top; leading +/@/⊘ line icons and a trailing filled
// circular send button on the bottom. Mirrors automatically in RTL via logical properties.
export function ChatComposer({
  value,
  onChange,
  onSend,
  onAt,
  onKeyDownCapture,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onAt: () => void
  onKeyDownCapture?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  inputRef?: React.RefObject<HTMLTextAreaElement>
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

  return (
    <Surface elevation="popover" className="rounded-bubble p-3">
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
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Add" className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-subtle hover:text-ink">
            <PlusIcon size={18} />
          </button>
          <button type="button" onClick={onAt} aria-label="Mention" className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-subtle hover:text-ink">
            <AtIcon size={18} />
          </button>
          <button type="button" aria-label="Commands" className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-subtle hover:text-ink">
            <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] ring-[1.4px] ring-current">
              <SlashIcon size={12} />
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={!hasContent}
          aria-label="Send"
          className={`grid h-8 w-8 place-items-center rounded-full text-white transition-colors ${
            hasContent ? 'bg-ink hover:bg-black' : 'bg-ink-faint/60'
          }`}
        >
          <ArrowUpIcon size={17} />
        </button>
      </div>
    </Surface>
  )
}
