const features = [
  {
    num: '01',
    title: 'תמלול מלא של השיחה',
    description: 'כיסוי מלא ומדויק מתחילת השיחה ועד לסיום ההערות החותמות. ללא קיצורים, ללא סיכומים.',
  },
  {
    num: '02',
    title: 'הפרדת דוברים',
    description: 'מנהלים, אנליסטים ומנחים מזוהים ומסומנים עם תפקידם ושייכותם המוסדית.',
  },
  {
    num: '03',
    title: 'פורמט מוסדי',
    description: 'טיפוגרפיה בסגנון Bloomberg, חותמות זמן, מפרידי חלקים וייצוא מוכן-לביקורת ב-TXT ו-PDF.',
  },
]

export function FeatureCards() {
  return (
    <section id="features" className="py-20 border-t border-border">
      <div className="max-w-7xl mx-auto px-6">

        {/* Section header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <p className="font-mono-num text-xs text-accent tracking-widest uppercase mb-3">
              // 01 · יכולות
            </p>
            <h2 className="text-3xl font-bold text-text-primary tracking-tight">
              בנוי למשקיעים רציניים.
            </h2>
          </div>
          <span className="font-mono-num text-xs text-muted tracking-widest hidden md:block mt-1">
            REV.2026.Q1
          </span>
        </div>

        {/* Cards grid */}
        <div className="grid md:grid-cols-3 border border-border">
          {features.map((f, i) => (
            <div
              key={f.num}
              className={`p-8 ${i < features.length - 1 ? 'border-l border-border' : ''} hover:bg-white/[0.015] transition-colors group`}
            >
              {/* Card top: number + accent line */}
              <div className="flex items-center justify-between mb-8">
                <span className="font-mono-num text-xs text-muted">{f.num}</span>
                <div className="w-10 h-px bg-accent group-hover:w-16 transition-all duration-300" />
              </div>

              {/* Title */}
              <h3 className="text-base font-bold text-text-primary mb-3 leading-snug">
                {f.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-text-secondary leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
