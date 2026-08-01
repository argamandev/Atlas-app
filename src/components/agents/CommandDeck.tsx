'use client'

import { useI18n } from '@/lib/i18n/LocaleProvider'

// The command deck (design lines 2085-2096): a tight black strip that hugs its
// `>` lines at the top of the Agents page. Three faint prompt lines then the
// ready line. Static this chapter — there is no agent runtime to talk to, so it
// is a masthead, not a terminal.
//
// It follows the page direction rather than being pinned LTR: in Hebrew the
// prompts belong at the TOP RIGHT, where reading starts. `>` is a bidi-mirrored
// character, so the engine flips it to point leftward there on its own — which
// is what a prompt chevron should do in an RTL line.
export function CommandDeck() {
  const { dict } = useI18n()
  return (
    <div className="relative flex-none bg-ink px-[30px] py-3.5 font-mono-num text-[13.5px] font-medium leading-[1.62] tracking-[0.01em] text-white antialiased">
      <div aria-hidden className="text-[#4A4A4D]">
        &gt;
      </div>
      <div aria-hidden className="text-[#4A4A4D]">
        &gt;
      </div>
      <div aria-hidden className="text-[#4A4A4D]">
        &gt;
      </div>
      <div className="truncate">&gt; {dict.agents.ready}</div>
    </div>
  )
}
