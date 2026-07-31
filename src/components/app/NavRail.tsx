'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { LOCALE_COOKIE, localeNames, type Locale } from '@/lib/i18n/config'
import { cn } from '@/lib/utils'
import { BrandWordmark } from '@/components/ds/BrandWordmark'
import {
  HomeIcon,
  CalendarIcon,
  SparkleIcon,
  WorkspacesIcon,
  AgentsIcon,
  GlobeIcon,
  ProfileIcon,
  CollapseIcon,
  SearchIcon,
  ChevronRightIcon,
  type IconProps,
} from '@/components/ds/icons'

type NavItem = { key: string; href: string; icon: (p: IconProps) => JSX.Element; label: string }

// Harvey black nav rail (Design Round 2, single theme — the cycle is gone per spec
// docs/superpowers/specs/2026-07-25-design-round-2-harvey-import-design.md):
// wordmark → Quick access ⌘K chip → Home / Calendar / Chat / Workspace / Agents →
// (bottom) Profile / language toggle / collapse. Active item: white text on rail-active fill.
// Collapsed rail shows the "A" monogram and icon-only items.

export function NavRail() {
  const { dict, locale } = useI18n()
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  // The call view's Multi mode asks the rail to collapse for the full-report experience
  // (founder round 3) and to restore when it's left. The user's own toggle still works —
  // this only fires on view transitions.
  useEffect(() => {
    const onRailCollapse = (e: Event) => setCollapsed(Boolean((e as CustomEvent).detail?.collapsed))
    window.addEventListener('atlas:rail-collapse', onRailCollapse)
    return () => window.removeEventListener('atlas:rail-collapse', onRailCollapse)
  }, [])
  // one-time cleanup: browsers that saved a pre-Harvey scheme keep a dead attribute otherwise
  useEffect(() => {
    delete document.documentElement.dataset.scheme
    window.localStorage.removeItem('atlas-scheme')
  }, [])

  const otherLocale: Locale = locale === 'he' ? 'en' : 'he'
  function toggleLocale() {
    document.cookie = `${LOCALE_COOKIE}=${otherLocale}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  const mainNav: NavItem[] = [
    { key: 'home', href: '/app/home', icon: HomeIcon, label: dict.nav.home },
    { key: 'calendar', href: '/app/calendar', icon: CalendarIcon, label: dict.nav.calendar },
    { key: 'chat', href: '/app/chat', icon: SparkleIcon, label: dict.nav.chat },
    { key: 'workspace', href: '/app/workspace', icon: WorkspacesIcon, label: dict.nav.workspace },
    { key: 'agents', href: '/app/agents', icon: AgentsIcon, label: dict.nav.agents },
  ]

  const isActive = (href: string) => (href === '/app/home' ? pathname === href : pathname.startsWith(href))

  // design nav rows (lines 148-162): 14px, active weight 600, resting weight 450
  // (Segoe UI Variable's in-between weight — exactly what the design renders)
  const itemClasses = (active: boolean) =>
    cn(
      'flex w-full items-center rounded-lg py-[9px] text-[14px] transition-colors',
      collapsed ? 'justify-center px-0' : 'gap-[11px] px-[11px]',
      active
        ? 'bg-rail-active font-semibold text-rail-strong'
        : 'text-rail-text [font-weight:450] hover:bg-rail-chip hover:text-rail-strong'
    )

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const active = isActive(item.href)
    // the chat spark is drawn larger with a negative margin in the design (line 155)
    const isSpark = item.key === 'chat'
    return (
      <Link
        key={item.key}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={itemClasses(active)}
      >
        <Icon size={isSpark ? 25 : 18} strokeWidth={1.6} className={cn('flex-none', isSpark && '-m-1')} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    )
  }

  return (
    <nav
      className={cn(
        'flex shrink-0 flex-col overflow-hidden border-e border-rail-hair bg-rail transition-[width] duration-200',
        // design rail (probed): 230px wide, padding 22px 16px 16px — the breathing room
        collapsed ? 'w-[64px] p-2.5' : 'w-[230px] px-4 pb-4 pt-[22px]'
      )}
    >
      {/* brand — light wordmark on the black rail; monogram when collapsed */}
      <Link
        href="/app/home"
        aria-label={dict.common.brand}
        className={cn('mb-6 mt-1 flex items-center', collapsed ? 'justify-center' : 'ps-1')}
      >
        {collapsed ? (
          <img src="/brand/atlas-A.svg" alt="" className="rail-logo-img h-[22px] w-auto opacity-95" />
        ) : (
          /* design wordmark is 84px wide (line 135) → height 28 at the asset's aspect */
          <BrandWordmark height={28} className="text-rail-strong opacity-95" />
        )}
      </Link>

      {/* quick access (⌘K) — stub affordance */}
      <button
        type="button"
        title={dict.common.quickAccess}
        className={cn(
          'mb-[18px] flex w-full items-center rounded-lg border border-rail-hair bg-rail-chip py-[9px] text-rail-text transition-colors hover:text-white/90',
          collapsed ? 'justify-center px-0' : 'gap-[9px] px-[11px]'
        )}
      >
        <SearchIcon size={15} strokeWidth={1.7} className="flex-none" />
        {!collapsed && (
          <>
            <span className="flex-1 whitespace-nowrap text-start text-[13.5px]">
              {dict.common.quickAccess}
            </span>
            <span
              className="rounded-[5px] bg-rail-active px-1.5 py-0.5 text-[11px] tracking-[0.02em]"
              dir="ltr"
            >
              ⌘K
            </span>
          </>
        )}
      </button>

      <div className="flex flex-col gap-0.5">{mainNav.map(renderItem)}</div>

      <div className="mt-auto flex flex-col gap-0.5">
        <Link
          href="/app/settings"
          title={collapsed ? dict.nav.profile : undefined}
          className={itemClasses(isActive('/app/settings'))}
        >
          <ProfileIcon size={18} strokeWidth={1.6} className="flex-none" />
          {!collapsed && <span className="truncate">{dict.nav.profile}</span>}
        </Link>
        <button
          type="button"
          onClick={toggleLocale}
          title={collapsed ? localeNames[otherLocale] : undefined}
          className={itemClasses(false)}
        >
          <GlobeIcon size={18} strokeWidth={1.6} className="flex-none" />
          {!collapsed && <span className="truncate">{localeNames[otherLocale]}</span>}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={dict.nav.collapseSidebar}
          className={itemClasses(false)}
        >
          {collapsed ? (
            <ChevronRightIcon size={18} className="flex-none rtl:rotate-180" />
          ) : (
            <CollapseIcon size={18} className="flex-none" />
          )}
          {!collapsed && <span className="truncate">{dict.nav.collapseSidebar}</span>}
        </button>
      </div>
    </nav>
  )
}
