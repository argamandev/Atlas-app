import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Logo } from './Logo'
import { Avatar } from './Avatar'
import { selectionClasses } from './SelectableRow'

// THE most-repeated pattern (brief §3.6.1): leading logo/avatar → bold name →
// lighter secondary line → trailing-aligned metadata. One component, reused everywhere
// (activity feed, upcoming/live calls, @-mention list, watchlists, player identity).
export interface EntityRowProps {
  name: string
  secondary?: React.ReactNode
  secondaryIcon?: React.ReactNode
  meta?: React.ReactNode
  trailing?: React.ReactNode
  logoSrc?: string | null
  avatarSrc?: string | null
  kind?: 'company' | 'person'
  active?: boolean
  href?: string
  onClick?: () => void
  size?: number
  className?: string
}

export function EntityRow({
  name,
  secondary,
  secondaryIcon,
  meta,
  trailing,
  logoSrc,
  avatarSrc,
  kind = 'company',
  active,
  href,
  onClick,
  size = 36,
  className,
}: EntityRowProps) {
  const interactive = Boolean(href || onClick)

  const inner = (
    <>
      {kind === 'person' ? (
        <Avatar src={avatarSrc} name={name} size={size} />
      ) : (
        <Logo src={logoSrc} name={name} size={size} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight text-ink">{name}</span>
        {secondary != null && (
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
            {secondaryIcon}
            <span className="truncate">{secondary}</span>
          </span>
        )}
      </span>
      {meta != null && <span className="ms-auto shrink-0 ps-2 text-xs text-ink-faint">{meta}</span>}
      {trailing}
    </>
  )

  const cls = cn(
    'flex items-center gap-3 rounded-md px-2.5 py-2',
    interactive && selectionClasses(active),
    className
  )

  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(cls, 'w-full text-start')}>
        {inner}
      </button>
    )
  }
  return <div className={cls}>{inner}</div>
}
