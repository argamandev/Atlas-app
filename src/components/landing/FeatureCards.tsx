// ⚠️ LEGACY (Timlul) — slated for deletion ~2026-07. Do NOT use as a pattern for Atlas. See LEGACY.md
const modules = [
  {
    num: '01',
    title: 'CALL INTELLIGENCE',
    titleHe: 'ניתוח שיחות רווחים',
    status: 'ACTIVE' as const,
    description: 'תמלול מלא + הפרדת דוברים. כיסוי 100% ופורמט מוסדי מוכן לביקורת. הנהלה, אנליסטים ומנחים — מזוהים ומסומנים.',
  },
  {
    num: '02',
    title: 'SIGNAL DETECTION',
    titleHe: 'זיהוי אותות מהותיים',
    status: 'BETA' as const,
    description: 'זיהוי אוטומטי של אותות מהותיים: שינויי guidance, הכרזות buyback, צמצומים ואירועים רגולטוריים — ישירות מהתמלול.',
  },
  {
    num: '03',
    title: 'PORTFOLIO ALERTS',
    titleHe: 'התראות תיק בזמן אמת',
    status: 'DEV' as const,
    description: 'התראות ריאל-טיים כשחברות בתיק שלך משדרות שיחת רווחים. עיבוד אוטומטי + סיכום מוסדי ישירות לאינבוקס.',
  },
]

const STATUS_CONFIG = {
  ACTIVE: { label: 'ACTIVE',  color: 'text-success', dot: 'bg-success' },
  BETA:   { label: 'BETA',    color: 'text-amber-400', dot: 'bg-amber-400' },
  DEV:    { label: 'DEV',     color: 'text-muted',   dot: 'bg-muted' },
}

export function FeatureCards() {
  return (
    <section id="features" className="py-20 border-t border-border">
      <div className="max-w-7xl mx-auto px-6">

        {/* Section header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <p className="font-mono-num text-xs text-accent tracking-widest uppercase mb-3">
              // INTELLIGENCE MODULES
            </p>
            <h2 className="text-3xl font-bold text-text-primary tracking-tight">
              בנוי למשקיעים רציניים.
            </h2>
          </div>
          <span className="font-mono-num text-xs text-muted tracking-widest hidden md:block mt-1">
            REV.2026.Q2
          </span>
        </div>

        {/* Cards grid */}
        <div className="grid md:grid-cols-3 border border-border">
          {modules.map((m, i) => {
            const st = STATUS_CONFIG[m.status]
            return (
              <div
                key={m.num}
                className={`p-8 ${i < modules.length - 1 ? 'border-l border-border' : ''} hover:bg-white/[0.015] transition-colors group`}
              >
                {/* Card top: number + status badge */}
                <div className="flex items-center justify-between mb-8">
                  <span className="font-mono-num text-xs text-muted">MODULE {m.num}</span>
                  <div className={`inline-flex items-center gap-1.5 border px-2 py-0.5 ${
                    m.status === 'ACTIVE' ? 'border-success/30' :
                    m.status === 'BETA'   ? 'border-amber-400/30' :
                    'border-border'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot} ${m.status === 'ACTIVE' ? 'animate-blink' : ''}`} />
                    <span className={`font-mono-num text-2xs tracking-widest ${st.color}`}>{st.label}</span>
                  </div>
                </div>

                {/* Module name */}
                <div className="mb-1">
                  <span className="font-mono-num text-xs text-accent tracking-widest">{m.title}</span>
                </div>

                {/* Title */}
                <h3 className="text-base font-bold text-text-primary mb-4 leading-snug">
                  {m.titleHe}
                </h3>

                {/* Accent line */}
                <div className="w-10 h-px bg-accent group-hover:w-16 transition-all duration-300 mb-5" />

                {/* Description */}
                <p className="text-sm text-text-secondary leading-relaxed">
                  {m.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
