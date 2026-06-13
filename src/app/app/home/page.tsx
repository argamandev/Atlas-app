import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { AppPage } from '@/components/app/AppPage'
import { Greeting } from '@/components/app/Greeting'
import { SectionHeader } from '@/components/ds/SectionHeader'

// NOTE: minimal first cut to verify the shell. Full Home (real search + upcoming
// calls + live-now data) is built in P4 once the read-APIs land.
export default function HomePage() {
  const dict = getDictionary(getLocale())

  const panel = (
    <>
      <SectionHeader label={dict.home.liveNow} />
      <div className="rounded-md px-2.5 py-8 text-center text-sm text-ink-faint">{dict.home.noLiveNow}</div>
    </>
  )

  return (
    <AppPage panel={panel}>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <Greeting className="text-3xl font-bold text-ink" />
        <p className="max-w-md text-ink-muted">{dict.home.discoverSubhead}</p>
        <div className="mt-2 w-full max-w-md">
          <input
            className="w-full rounded-bubble border border-hairline bg-canvas px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-ink-faint"
            placeholder={dict.home.searchPlaceholder}
          />
        </div>
      </div>
    </AppPage>
  )
}
