'use client'

import { PlusIcon, MicIcon, ArrowUpIcon } from '@/components/ds/icons'

// The pill composer — the founder's 2026-08-01 design round.
//
// A conversation opens on the TALL composer (big, centred, with the + / @ / /
// affordances spelled out). The moment the first message is sent, the composer
// becomes this: a single fully-rounded bar pinned to the bottom. The founder's
// words in the design thread: "the first chat pannel will be the same as before,
// but after you sent a message it will look like this! the same in workspace
// chat and in wide agent chats."
//
// The @ and / buttons are deliberately absent here — the design dropped them
// once the bar became a pill; both characters are still typed directly, and the
// tall composer still teaches them.
//
// Shared by the chat thread and the workspace intake so the two cannot drift.
export function PillComposer({
  value,
  onChange,
  onSend,
  placeholder,
  sendLabel,
  addLabel,
  micLabel,
  disabled = false,
  disabledReason,
  autoFocus = false,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  /** `fromKey` says WHICH affordance sent: the Enter key, or the arrow button. */
  onSend: (fromKey: boolean) => void
  placeholder: string
  sendLabel: string
  addLabel: string
  micLabel: string
  /** inert surfaces say so out loud rather than accepting input that goes nowhere */
  disabled?: boolean
  disabledReason?: string
  autoFocus?: boolean
  /** so a caller can put focus back after its own overlay took it */
  inputRef?: React.RefObject<HTMLInputElement>
}) {
  return (
    <div
      className="flex h-[46px] w-full items-center gap-2.5 rounded-full border border-hairline bg-paper ps-[15px] pe-[7px] shadow-soft"
      title={disabled ? disabledReason : undefined}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={addLabel}
        className="flex flex-none text-ink-ghost transition-colors hover:text-ink disabled:cursor-not-allowed disabled:hover:text-ink-ghost"
      >
        <PlusIcon size={18} strokeWidth={1.7} />
      </button>

      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            // `true` = this came from the KEY. A caller with a floating picker
            // open may decline the keystroke (the picker is choosing with it)
            // while still honouring the button below — see WorkspaceIntake.
            onSend(true)
          }
        }}
        placeholder={placeholder}
        dir="auto"
        className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-ghost disabled:cursor-not-allowed"
      />

      <button
        type="button"
        disabled={disabled}
        aria-label={micLabel}
        className="flex flex-none text-ink-faint transition-colors hover:text-ink disabled:cursor-not-allowed disabled:hover:text-ink-faint"
      >
        <MicIcon size={17} strokeWidth={1.6} />
      </button>

      <button
        type="button"
        // `false` = the BUTTON sent, not the key. Written out rather than a bare
        // `onSend`, which would feed React's MouseEvent in as `fromKey` — the
        // same shape as the defect that once killed mouse-send in the chat composer
        onClick={() => onSend(false)}
        disabled={disabled}
        aria-label={sendLabel}
        // The design draws the send affordance solid at all times — it does not
        // grey out on an empty input the way the tall composer does.
        className={`flex h-8 w-8 flex-none items-center justify-center rounded-full transition-colors ${
          disabled ? 'bg-send-idle text-canvas' : 'bg-ink text-paper'
        }`}
      >
        <ArrowUpIcon size={15} strokeWidth={2} />
      </button>
    </div>
  )
}
