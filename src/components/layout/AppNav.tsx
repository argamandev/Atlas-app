'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

interface AppNavProps {
  userName: string
  isAdmin?: boolean
}

export function AppNav({ userName, isAdmin = false }: AppNavProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const adminView = searchParams.get('view') === 'admin'

  const onDashboard = pathname === '/dashboard'
  const onCompanies = pathname?.startsWith('/companies') ?? false

  return (
    <header
      className="no-print relative z-30 flex items-center justify-between px-6 h-14 border-b border-border bg-bg/90 backdrop-blur-sm flex-shrink-0"
      dir="rtl"
    >
      {/* Brand — top right */}
      <Link href="/dashboard" className="font-bold text-white text-base tracking-tight" dir="rtl">
        תמלול<span className="text-accent">.</span>
      </Link>

      {/* Center nav */}
      <nav className="flex items-center gap-1">
        <NavLink href="/dashboard" active={onDashboard && !adminView}>תמלול חדש</NavLink>
        <NavLink href="/companies" active={onCompanies}>חברות</NavLink>
        {isAdmin && (
          <NavLink href="/dashboard?view=admin" active={onDashboard && adminView} accent>
            Admin
          </NavLink>
        )}
      </nav>

      {/* User — top left with sign out */}
      <div className="flex items-center gap-4" dir="ltr">
        <span className="text-sm text-text-secondary hidden sm:block">{userName}</span>
        <a
          href="/api/auth/signout"
          className="text-sm text-muted hover:text-text-primary transition-colors"
        >
          יציאה
        </a>
      </div>
    </header>
  )
}

function NavLink({
  href,
  active,
  accent,
  children,
}: {
  href: string
  active: boolean
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`text-sm font-medium px-4 py-2 transition-colors border-b-2 ${
        active
          ? 'text-text-primary border-accent'
          : accent
          ? 'text-accent/60 border-transparent hover:text-accent hover:border-accent/40'
          : 'text-muted border-transparent hover:text-text-secondary hover:border-border'
      }`}
    >
      {children}
    </Link>
  )
}
