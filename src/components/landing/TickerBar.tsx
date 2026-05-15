const STOCKS = [
  { ticker: 'TEVA',  name: 'טבע',        price: '18.42',  change: '+0.84%', up: true  },
  { ticker: 'CHKP',  name: "צ'קפוינט",   price: '152.30', change: '-0.32%', up: false },
  { ticker: 'NICE',  name: 'נייס',        price: '198.70', change: '+1.21%', up: true  },
  { ticker: 'ICL',   name: 'כיל',         price: '42.15',  change: '+0.67%', up: true  },
  { ticker: 'ESLT',  name: 'אלביט',       price: '214.80', change: '-1.45%', up: false },
  { ticker: 'AZRG',  name: 'אזריאלי',     price: '118.40', change: '+0.43%', up: true  },
  { ticker: 'ENRG',  name: 'אנרגיקס',     price: '67.25',  change: '+2.15%', up: true  },
  { ticker: 'TGBR',  name: 'תגבור',       price: '14.82',  change: '-0.89%', up: false },
  { ticker: 'NTML',  name: 'נטו מלינדה',  price: '31.60',  change: '+0.55%', up: true  },
  { ticker: 'WIX',   name: 'וויקס',       price: '152.90', change: '+1.87%', up: true  },
]

const SIGNALS = [
  { label: 'INSIDER BUY',     ticker: 'TEVA' },
  { label: 'CEO PURCHASE',    ticker: 'CHKP' },
  { label: 'UNUSUAL VOLUME',  ticker: 'NICE' },
  { label: 'LIVE CALL ACTIVE', ticker: null  },
  { label: 'EARNINGS BEAT',   ticker: 'ICL'  },
  { label: 'FILING DETECTED', ticker: 'ESLT' },
]

function StockItem({ t }: { t: typeof STOCKS[0] }) {
  return (
    <span className="inline-flex items-center gap-2 px-5 border-l border-border/60 flex-shrink-0">
      <span className="font-mono-num font-bold text-xs text-text-primary tracking-wider">{t.ticker}</span>
      <span className="font-mono-num text-2xs text-muted">{t.name}</span>
      <span className="font-mono-num text-xs text-text-secondary">{t.price}</span>
      <span className={`font-mono-num text-xs font-medium ${t.up ? 'text-success' : 'text-error'}`}>
        {t.change}
      </span>
    </span>
  )
}

function SignalItem({ s }: { s: typeof SIGNALS[0] }) {
  return (
    <span className="inline-flex items-center gap-2 px-5 border-l border-border/60 flex-shrink-0">
      <span className="font-mono-num text-2xs text-accent tracking-widest">■</span>
      <span className="font-mono-num font-bold text-xs text-accent tracking-wider">{s.label}</span>
      {s.ticker && (
        <span className="font-mono-num text-2xs text-accent/60 tracking-widest">{s.ticker}</span>
      )}
    </span>
  )
}

function buildTrack(): JSX.Element[] {
  const items: JSX.Element[] = []
  let si = 0
  STOCKS.forEach((stock, i) => {
    items.push(<StockItem key={`stock-${i}`} t={stock} />)
    if ((i + 1) % 2 === 0 && si < SIGNALS.length) {
      items.push(<SignalItem key={`signal-${si}`} s={SIGNALS[si]} />)
      si++
    }
  })
  return items
}

export function TickerBar() {
  const track = buildTrack()
  return (
    <div
      className="fixed top-14 right-0 left-0 z-40 h-8 bg-[#080808] border-b border-border overflow-hidden flex items-center"
      dir="ltr"
    >
      <div className="ticker-track">
        {track}
        {track}
      </div>
    </div>
  )
}
