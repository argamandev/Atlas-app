// ⚠️ LEGACY (Timlul) — slated for deletion ~2026-07. Do NOT use as a pattern for Atlas. See LEGACY.md
const previewLines = [
  {
    time: '00:01:48',
    speaker: 'גיל שרון',
    role: 'ceo' as const,
    roleLabel: 'מנכ"ל',
    affiliation: null,
    text: 'צהריים טובים לכולם ותודה שהצטרפתם. אנחנו מציגים היום תוצאות חזקות מאוד לרבעון הראשון של 2026. ההכנסות הסתכמו ב-2.4 מיליארד שקל, גידול של 18% שנה-על-שנה, עם שיפור של 180 נקודות בסיס במרווח הרווח הגולמי שעמד על 47.3%.',
  },
  {
    time: '00:08:14',
    speaker: 'אורית כהן',
    role: 'cfo' as const,
    roleLabel: 'סמנכ"לית כספים',
    affiliation: null,
    text: 'ה-EBITDA המתואמת עמדה על 680 מיליון שקל, גידול של 22% לעומת הרבעון המקביל ומייצגת מרווח EBITDA של 28.3%. תזרים המזומנים מפעילות שוטפת הסתכם ב-510 מיליון שקל — המספר הגבוה ביותר שדיווחנו עליו. ה-CapEx ברבעון היה 180 מיליון שקל, בהתאם לתוכנית השנתית.',
  },
  {
    time: '00:18:55',
    speaker: 'דניאל לוי',
    role: 'analyst' as const,
    roleLabel: 'אנליסט',
    affiliation: 'Goldman Sachs',
    text: 'תודה על הפירוט. האם תוכלו לדון במה שאתם רואים מבחינת עמידות הביקוש ואיך אתם חושבים על ציפיות המרווח הגולמי ככל שמחזור המוצר החדש מתאיץ? ובפרט, כיצד תשפיע פלטפורמת Aero-9 על השולים בשני הרבעונים הקרובים?',
  },
]

const speakerStyle = {
  ceo:     { name: 'text-accent font-bold',          dot: 'text-muted' },
  cfo:     { name: 'text-accent font-medium opacity-80', dot: 'text-muted' },
  analyst: { name: 'text-text-secondary font-medium',   dot: 'text-muted' },
}

export function TranscriptPreview() {
  return (
    <section className="py-20 border-t border-border">
      <div className="max-w-7xl mx-auto px-6">

        {/* Section header */}
        <div className="mb-10">
          <p className="font-mono-num text-xs text-accent tracking-widest uppercase mb-3">
            // 02 · פלט לדוגמה
          </p>
          <h2 className="text-3xl font-bold text-text-primary tracking-tight">
            קראו כמו שקוראים בדסק.
          </h2>
        </div>

        {/* Terminal preview window */}
        <div className="border border-border max-w-5xl">

          {/* Document header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-[#0a0a0a]">
            <div className="flex items-center gap-4" dir="ltr">
              <span className="font-mono-num text-xs font-bold text-accent">AMAT.IL</span>
              <span className="font-mono-num text-xs text-text-secondary">אפלייד מטריאלס ישראל</span>
              <span className="font-mono-num text-xs text-muted">Q1 2026 שיחת משקיעים</span>
            </div>
            <span className="font-mono-num text-xs text-muted" dir="ltr">07 · 05 · 2026</span>
          </div>

          {/* Lines */}
          <div className="divide-y divide-border/40 bg-bg">
            {previewLines.map((line, i) => {
              const style = speakerStyle[line.role]
              return (
                <div key={i} className="px-6 py-5">
                  {/* Speaker row */}
                  <div className="flex items-center gap-3 mb-3" dir="ltr">
                    <span className="font-mono-num text-xs text-muted w-14 flex-shrink-0">{line.time}</span>
                    <span className={`font-mono-num text-xs ${style.name}`}>{line.speaker}</span>
                    {line.affiliation && (
                      <span className="font-mono-num text-xs text-muted">, {line.affiliation}</span>
                    )}
                    <span className={`font-mono-num text-xs ${style.dot}`}>·</span>
                    <span className="font-mono-num text-xs text-muted">{line.roleLabel}</span>
                  </div>
                  {/* Text */}
                  <p className="font-mono-num text-sm text-text-secondary leading-7 mr-[68px]">
                    {line.text}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Fade footer */}
          <div className="relative h-16 bg-gradient-to-t from-bg to-transparent border-t border-border/30 flex items-center justify-center">
            <span className="font-mono-num text-xs text-muted tracking-widest">· · ·</span>
          </div>
        </div>

      </div>
    </section>
  )
}
