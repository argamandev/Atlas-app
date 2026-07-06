// Company-overview density modules — STUB DATA behind typed interfaces.
// The design's overview page carries identity extras (IR contact, index
// memberships), a "Latest reported quarter" module and a "Latest
// announcements" list. None of these have data feeds yet (MAYA announcements
// feed + reported-results extraction are roadmap items), so every company
// shows the design's demo content. Swapping in real feeds later only
// replaces this module's internals — the interfaces stay.

export interface ReportedQuarterStub {
  quarter: string
  /** ISO date the results were reported */
  reportedAtIso: string
  /** the highlighted management quote, Hebrew (design demo content) */
  quoteHe: string
  speakerRole: string
  /** transcript anchor for "Jump to X in transcript" */
  jumpSeconds: number
  /** outlook chip key — 'raised' renders the ▴ full-year-outlook chip */
  outlook: 'raised'
}

export interface AnnouncementStub {
  dateIso: string
  tag: 'IMMEDIATE' | 'TRANSACTION' | 'FINANCIALS'
  titleHe: string
}

export interface CompanyOverviewStub {
  irName: string
  indices: string[]
  reported: ReportedQuarterStub
  announcements: AnnouncementStub[]
}

export function companyOverviewStub(_companyId: string): CompanyOverviewStub {
  return {
    irName: 'Zvika Rabin',
    indices: ['TA-125', 'TA-90'],
    reported: {
      quarter: 'Q2 2026',
      reportedAtIso: '2026-06-16',
      quoteHe:
        'אנחנו מעלים את תחזית ההכנסות לשנה כולה לטווח של 1.5 עד 1.6 מיליארד שקל, על רקע ביקושים חזקים ברבעון.',
      speakerRole: 'CEO',
      jumpSeconds: 41,
      outlook: 'raised',
    },
    announcements: [
      { dateIso: '2026-06-30', tag: 'IMMEDIATE', titleHe: 'מינוי סמנכ"ל תפעול חדש לקבוצה' },
      { dateIso: '2026-06-22', tag: 'TRANSACTION', titleHe: 'השלמת רכישת פעילות השינוע בנמל אשדוד' },
      { dateIso: '2026-06-16', tag: 'FINANCIALS', titleHe: 'דוחות כספיים לרבעון השני של 2026' },
      { dateIso: '2026-06-02', tag: 'IMMEDIATE', titleHe: 'זימון אסיפה כללית מיוחדת' },
    ],
  }
}
