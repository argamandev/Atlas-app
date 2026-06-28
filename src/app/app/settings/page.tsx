import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { AppPage } from '@/components/app/AppPage'
import { Surface } from '@/components/ds/Surface'
import { LanguageToggle } from '@/components/ds/LanguageToggle'

export default function SettingsPage() {
  const dict = getDictionary(getLocale())

  const stubSections = [
    { key: 'profile', label: dict.settings.profile },
    { key: 'account', label: dict.settings.account },
    { key: 'notifications', label: dict.settings.notifications },
    { key: 'appearance', label: dict.settings.appearance },
  ]

  return (
    <AppPage>
      <div className="app-scroll flex-1 overflow-y-auto px-8 py-8 pb-dock">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-2xl font-bold text-ink">{dict.settings.title}</h1>

          <div className="mt-6 space-y-3">
            {/* Language switch — the EN ⇄ HE flip lives here (brief §6). */}
            <Surface tone="canvas" className="border border-hairline p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-ink">{dict.settings.language}</div>
                  <p className="mt-1 text-sm text-ink-muted">{dict.settings.languageDesc}</p>
                </div>
                <LanguageToggle className="rounded-md border border-hairline bg-panel p-1" />
              </div>
            </Surface>

            {stubSections.map((s) => (
              <Surface key={s.key} tone="canvas" className="border border-hairline p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-ink">{s.label}</div>
                  <span className="text-xs text-ink-faint">{dict.common.comingSoon}</span>
                </div>
              </Surface>
            ))}
          </div>
        </div>
      </div>
    </AppPage>
  )
}
