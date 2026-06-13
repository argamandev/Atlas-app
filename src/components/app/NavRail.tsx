'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { cn } from '@/lib/utils'
import { selectionClasses } from '@/components/ds/SelectableRow'
import {
  HomeIcon,
  CalendarIcon,
  SearchIcon,
  ChatIcon,
  TopicsIcon,
  SavedIcon,
  WorkspacesIcon,
  WatchlistsIcon,
  ReleaseNotesIcon,
  HelpIcon,
  ProfileIcon,
  SettingsIcon,
  CollapseIcon,
  type IconProps,
} from '@/components/ds/icons'

type NavItem = { key: string; href: string; icon: (p: IconProps) => JSX.Element; label: string; stub?: boolean }

// The labeled nav column (brief §4 / reference left column). Active item gets the
// shared selection fill; the whole rail sits on the leading edge and mirrors in RTL.
export function NavRail() {
  const { dict } = useI18n()
  const pathname = usePathname()

  const mainNav: NavItem[] = [
    { key: 'home', href: '/app/home', icon: HomeIcon, label: dict.nav.home },
    { key: 'calendar', href: '/app/calendar', icon: CalendarIcon, label: dict.nav.calendar },
    { key: 'search', href: '/app/home', icon: SearchIcon, label: dict.nav.search },
    { key: 'chat', href: '/app/chat', icon: ChatIcon, label: dict.nav.chat },
    { key: 'topics', href: '#', icon: TopicsIcon, label: dict.nav.topics, stub: true },
    { key: 'saved', href: '#', icon: SavedIcon, label: dict.nav.saved, stub: true },
    { key: 'workspaces', href: '#', icon: WorkspacesIcon, label: dict.nav.workspaces, stub: true },
    { key: 'watchlists', href: '#', icon: WatchlistsIcon, label: dict.nav.watchlists, stub: true },
  ]

  const footerNav: NavItem[] = [
    { key: 'release', href: '#', icon: ReleaseNotesIcon, label: dict.nav.releaseNotes, stub: true },
    { key: 'help', href: '#', icon: HelpIcon, label: dict.nav.helpSupport, stub: true },
    { key: 'profile', href: '/app/settings', icon: ProfileIcon, label: dict.nav.profile },
    { key: 'settings', href: '/app/settings', icon: SettingsIcon, label: dict.nav.settings },
  ]

  const isActive = (href: string) =>
    href !== '#' && href !== '/app/home' ? pathname.startsWith(href) : pathname === href

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const active = isActive(item.href)
    const content = (
      <>
        <Icon size={18} className={cn(active ? 'text-ink' : 'text-ink-muted')} />
        <span className={cn('truncate text-sm', active ? 'font-semibold text-ink' : 'text-ink-muted')}>
          {item.label}
        </span>
      </>
    )
    const cls = cn('flex items-center gap-3 rounded-md px-2.5 py-1.5', selectionClasses(active))
    if (item.stub) {
      return (
        <button key={item.key} type="button" className={cn(cls, 'w-full text-start opacity-90')} title={dict.common.comingSoon}>
          {content}
        </button>
      )
    }
    return (
      <Link key={item.key} href={item.href} className={cls}>
        {content}
      </Link>
    )
  }

  return (
    <nav className="app-scroll hidden w-[230px] shrink-0 flex-col overflow-y-auto border-e border-hairline bg-panel p-3 md:flex">
      {/* brand */}
      <Link href="/app/home" className="mb-3 flex items-center gap-2 px-1.5 py-1">
        <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-ink text-[11px] font-bold text-white">ת</span>
        <span className="text-[15px] font-bold tracking-tight text-ink">{dict.common.brand}</span>
      </Link>

      {/* quick access (⌘K) — stub */}
      <button
        type="button"
        className="mb-3 flex items-center justify-between rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-ink-faint transition-colors hover:text-ink-muted"
        title={dict.common.comingSoon}
      >
        <span className="flex items-center gap-2">
          <SearchIcon size={15} />
          <span className="text-sm">{dict.common.quickAccess}</span>
        </span>
        <kbd className="rounded-sm bg-subtle px-1.5 py-0.5 text-2xs font-medium text-ink-faint" dir="ltr">⌘K</kbd>
      </button>

      <div className="flex flex-col gap-0.5">{mainNav.map(renderItem)}</div>

      <div className="mt-auto flex flex-col gap-0.5 pt-4">
        {footerNav.map(renderItem)}
        <button
          type="button"
          className="flex items-center gap-3 rounded-md px-2.5 py-1.5 text-ink-faint transition-colors hover:bg-subtle/70 hover:text-ink-muted"
          title={dict.nav.collapseSidebar}
        >
          <CollapseIcon size={18} />
          <span className="truncate text-sm">{dict.nav.collapseSidebar}</span>
        </button>
      </div>
    </nav>
  )
}
