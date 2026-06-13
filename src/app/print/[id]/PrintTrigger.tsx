'use client'

import { useEffect } from 'react'

// Auto-opens the browser print dialog ("Save as PDF") shortly after the page renders, and
// offers a manual button as a fallback. Hidden in the printed output via .no-print.
export function PrintTrigger({ label }: { label: string }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [])
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print"
      style={{
        position: 'fixed',
        top: 16,
        insetInlineEnd: 16,
        zIndex: 50,
        padding: '8px 14px',
        borderRadius: 8,
        background: '#1a1a1a',
        color: '#fff',
        fontSize: 13,
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
