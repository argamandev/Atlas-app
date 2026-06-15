'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { cn } from '@/lib/utils'
import { selectionClasses } from '@/components/ds/SelectableRow'
import { BrandWordmark } from '@/components/ds/BrandWordmark'
import {
  HomeIcon,
  CalendarIcon,
  SparkleIcon,
  ProfileIcon,
  CollapseIcon,
  SearchIcon,
  ChevronRightIcon,
  type IconProps,
} from '@/components/ds/icons'

type NavItem = { key: string; href: string; icon: (p: IconProps) => JSX.Element; label: string }

// Three-layer sidebar's nav rail. Slimmed to the first-product surface (Home / Calendar /
// Chat + Profile) and collapsible to an icon-only rail. "Chat" uses the sparkle icon —
// the single chat affordance across the app.
export function NavRail() {
  const { dict } = useI18n()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const mainNav: NavItem[] = [
    { key: 'home', href: '/app/home', icon: HomeIcon, label: dict.nav.home },
    { key: 'calendar', href: '/app/calendar', icon: CalendarIcon, label: dict.nav.calendar },
    { key: 'chat', href: '/app/chat', icon: SparkleIcon, label: dict.nav.chat },
  ]
  const footerNav: NavItem[] = [{ key: 'profile', href: '/app/settings', icon: ProfileIcon, label: dict.nav.profile }]

  const isActive = (href: string) => (href === '/app/home' ? pathname === href : pathname.startsWith(href))

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const active = isActive(item.href)
    return (
      <Link
        key={item.key}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn('flex items-center gap-3 rounded-md py-1.5 transition-colors', collapsed ? 'justify-center px-0' : 'px-2.5', selectionClasses(active))}
      >
        <Icon size={18} className={active ? 'text-ink' : 'text-ink-muted'} />
        {!collapsed && (
          <span className={cn('truncate text-sm', active ? 'font-semibold text-ink' : 'text-ink-muted')}>{item.label}</span>
        )}
      </Link>
    )
  }

  return (
    <nav
      className={cn(
        'flex shrink-0 flex-col border-e border-hairline bg-panel p-3 transition-[width] duration-200',
        collapsed ? 'w-[60px]' : 'w-[230px]',
      )}
    >
      {/* brand wordmark — the real Atlas logo, recolored to ink via currentColor.
          Collapsed rail shows a serif "A" monogram echoing the wordmark. */}
      <Link
        href="/app/home"
        aria-label={dict.common.brand}
        className={cn('mb-3 flex items-center px-1.5 py-1', collapsed ? 'justify-center' : 'gap-2')}
      >
        {collapsed ? (
          <span className="text-[18px] font-semibold leading-none text-ink" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>
            A
          </span>
        ) : (
          <BrandWordmark height={18} className="text-ink" />
        )}
      </Link>

      {/* quick access (⌘K) — stub */}
      <button
        type="button"
        title={dict.common.quickAccess}
        className={cn(
          'mb-3 flex items-center rounded-md border border-hairline bg-canvas py-1.5 text-ink-faint transition-colors hover:text-ink-muted',
          collapsed ? 'justify-center px-0' : 'justify-between px-2.5',
        )}
      >
        {collapsed ? (
          <SearchIcon size={15} />
        ) : (
          <>
            <span className="flex items-center gap-2">
              <SearchIcon size={15} />
              <span className="text-sm">{dict.common.quickAccess}</span>
            </span>
            <kbd className="rounded-sm bg-subtle px-1.5 py-0.5 text-2xs font-medium text-ink-faint" dir="ltr">
              ⌘K
            </kbd>
          </>
        )}
      </button>

      <div className="flex flex-col gap-0.5">{mainNav.map(renderItem)}</div>

      <div className="mt-auto flex flex-col gap-0.5 pt-4">
        {footerNav.map(renderItem)}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={dict.nav.collapseSidebar}
          className={cn(
            'flex items-center gap-3 rounded-md py-1.5 text-ink-faint transition-colors hover:bg-subtle/70 hover:text-ink-muted',
            collapsed ? 'justify-center px-0' : 'px-2.5',
          )}
        >
          {collapsed ? <ChevronRightIcon size={18} /> : <CollapseIcon size={18} />}
          {!collapsed && <span className="truncate text-sm">{dict.nav.collapseSidebar}</span>}
        </button>
      </div>
    </nav>
  )
}
