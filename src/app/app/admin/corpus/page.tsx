import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { AppPage } from '@/components/app/AppPage'
import { Surface } from '@/components/ds/Surface'
import { getCurrentUser } from '@/lib/auth'
import { readCorpusIndexHealth } from '@/lib/corpus/indexHealthDb'
import type { CorpusIndexHealth, StatusTally } from '@/lib/corpus/indexHealth'

// ─────────────────────────────────────────────────────────────────────────────
// THE INDEX-STATUS SCREEN slice A3 deferred and slice A5 owes.
//
// The ingestion standard §5 makes an embedding failure visible BY LAW — every
// corpus source carries pending/indexed/failed/excluded and "search never
// pretends an unindexed document doesn't exist". A3 landed the column and wrote
// the honest gap into its own accounting table: *"Admin surface: NOT YET BUILT —
// the status is queryable; a screen shows it when A5's admin view lands."*
//
// Why it stops being optional here. Through A4 the corpus was 26 documents and
// one person could read every row by hand. After this slice it is ~1,200,
// maintained by three unattended callers, and a status nobody can see is a status
// nobody checks — a corpus quietly 8% unindexed still answers every question with
// total confidence, out of the 92% it happens to hold.
//
// THE PAGE ENDS IN EXACTLY ONE OF: refusal · error · content (app.md). There is
// no fourth, fabricated state — in particular a read failure says so rather than
// rendering zeroes, which would read as "the corpus is empty and fine".
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export default async function CorpusAdminPage() {
  const locale = getLocale()
  const dict = getDictionary(locale)
  const d = dict.corpusAdmin

  // /app/* is gated by the middleware, so this is the ADMIN half only. A
  // non-admin gets a refusal and no numbers — not an empty page, which would read
  // as "the corpus is empty" rather than "this is not yours to see".
  const { isAdmin } = await getCurrentUser()
  if (!isAdmin) {
    return (
      <AppPage>
        <Shell title={d.title}>
          <Surface tone="canvas" className="border border-hairline p-5">
            <p className="text-sm text-ink-muted">{d.adminOnly}</p>
          </Surface>
        </Shell>
      </AppPage>
    )
  }

  const health = await readCorpusIndexHealth()

  return (
    <AppPage>
      <Shell title={d.title} subtitle={d.subtitle}>
        {health === null ? (
          <Surface tone="canvas" className="border border-hairline p-5">
            <p className="text-sm text-ink-muted">{d.loadFailed}</p>
          </Surface>
        ) : (
          <Health health={health} d={d} />
        )}
      </Shell>
    </AppPage>
  )
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="app-scroll flex-1 overflow-y-auto px-8 py-8 pb-dock">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
        <div className="mt-6 space-y-3">{children}</div>
      </div>
    </div>
  )
}

type Dict = ReturnType<typeof getDictionary>['corpusAdmin']

function Health({ health, d }: { health: CorpusIndexHealth; d: Dict }) {
  return (
    <>
      <TallyCard label={d.transcripts} tally={health.transcripts} d={d} />
      <TallyCard label={d.documents} tally={health.documents} d={d} />

      <Surface tone="canvas" className="border border-hairline p-5">
        <Row label={d.chunks} value={health.chunks} />
      </Surface>

      <Surface tone="canvas" className="border border-hairline p-5">
        <div className="text-sm font-semibold text-ink">{d.structuredFacts}</div>
        <div className="mt-3 space-y-1.5">
          <Row label={d.factsYes} value={health.facts.facts} />
          <Row label={d.factsNone} value={health.facts.none} />
          <Row
            label={d.factsFailed}
            value={health.facts.failed}
            tone={health.facts.failed ? 'warn' : undefined}
          />
          <Row label={d.factsUnknown} value={health.facts.unknown} />
        </div>
      </Surface>

      <Surface tone="canvas" className="border border-hairline p-5">
        <div className="flex items-baseline justify-between gap-4">
          <div className="text-sm font-semibold text-ink">{d.troubledTitle}</div>
          {/* THE TRUE TOTAL, always — the list below is capped at 200. Showing 200
              of 900 without saying so is the same lie this screen exists to catch,
              one level down. */}
          <div className="text-sm text-ink-muted tabular-nums">{health.troubledTotal}</div>
        </div>
        {health.troubled.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">{health.settled ? d.settled : d.troubledEmpty}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {health.troubled.map((s) => (
              <li key={`${s.kind}:${s.id}`} className="text-sm">
                {/* A DOCUMENT TITLE IS HEBREW; ITS ID AND STATUS ARE LATIN. Each run
                    gets its own <bdi> and the direction stays on this container —
                    `dir="auto"` here would resolve from the line's first strong
                    character, so one Hebrew title would throw the trailing Latin
                    runs and their separators to the far side. This repo's
                    most-repeated defect (rules/app.md). */}
                <span className="text-ink">
                  <bdi>{s.title}</bdi>
                </span>
                <span className="text-ink-faint">
                  {' · '}
                  <bdi>{s.id}</bdi>
                  {' · '}
                  <bdi>{s.status === 'failed' ? d.failed : d.pending}</bdi>
                </span>
              </li>
            ))}
          </ul>
        )}
        {health.troubled.length < health.troubledTotal ? (
          <p className="mt-3 text-xs text-ink">
            {d.troubledCapped
              .replace('{shown}', String(health.troubled.length))
              .replace('{total}', String(health.troubledTotal))}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-ink-faint">{d.excludedNote}</p>
      </Surface>
    </>
  )
}

function TallyCard({ label, tally, d }: { label: string; tally: StatusTally; d: Dict }) {
  return (
    <Surface tone="canvas" className="border border-hairline p-5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-sm font-semibold text-ink">{label}</div>
        <div className="text-sm text-ink-muted tabular-nums">{tally.total}</div>
      </div>
      <div className="mt-3 space-y-1.5">
        <Row label={d.indexed} value={tally.indexed} />
        <Row label={d.pending} value={tally.pending} tone={tally.pending ? 'warn' : undefined} />
        <Row label={d.failed} value={tally.failed} tone={tally.failed ? 'warn' : undefined} />
        <Row label={d.excluded} value={tally.excluded} />
        {/* Shown ONLY when it is non-zero, because a permanent "Unrecognised: 0"
            trains the eye to skip the line that matters on the day it is not 0. */}
        {tally.other > 0 ? <Row label={d.other} value={tally.other} tone="warn" /> : null}
      </div>
    </Surface>
  )
}

function Row({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className={tone === 'warn' ? 'text-ink' : 'text-ink-muted'}>{label}</span>
      <span className={`tabular-nums ${tone === 'warn' ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
        {value}
      </span>
    </div>
  )
}
