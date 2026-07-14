// Slides/Report facet demo cards — STUB CONTENT (design's demo deck/report)
// shown until real slide decks and report PDFs are linked to calls. The panes
// render these as the design's dark content cards instead of empty dashes.

export interface SlideStub {
  title: string
  body: string
}

export interface ReportStub {
  title: string
  dateLine: string
  paragraphs: string[]
  hint: string
}

export function slideStubs(): SlideStub[] {
  return [
    {
      title: 'מבנה הבעלות באפגלו',
      body: '25% מהחברה הגרמנית מוחזקים בידי קרנות העושר של קטר וסעודיה — סוגיה ביטחונית מהותית.',
    },
    {
      title: 'תחזית הכנסות 2026',
      body: 'טווח מעודכן של 1.5 עד 1.6 מיליארד שקל לשנה כולה, על רקע ביקושים חזקים ברבעון.',
    },
    {
      title: 'צבר הזמנות',
      body: 'צבר ההזמנות חצה רף שיא חדש ומספק כיסוי לארבעה רבעונים קדימה.',
    },
    {
      title: 'שאלות ותשובות',
      body: 'ההנהלה עונה לשאלות האנליסטים על רגולציה, מטבע ותוכנית ההשקעות.',
    },
  ]
}

export function reportStub(): ReportStub {
  return {
    title: 'סיכום ועדת הכלכלה',
    dateLine: '15 ביוני 2026',
    paragraphs: [
      'הוועדה דנה בהשלכות הביטחוניות של מכירת ציוד ותשתיות ספנות לגורמים זרים, על רקע אחזקות קרנות העושר הקטריות והסעודיות בחברה הרוכשת.',
    ],
    hint: 'סמנו טקסט כדי לצטט, לשתף או לשאול את אטלס.',
  }
}
