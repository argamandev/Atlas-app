import { notFound } from 'next/navigation'
import { loadDemoCall, loadCompletedCall } from '@/lib/live/loadCall'
import { formatDate } from '@/lib/i18n/format'
import { PrintTrigger } from './PrintTrigger'

export const dynamic = 'force-dynamic'

// Clean, print-optimized transcript — opened by the "Share as PDF" button. Standalone (no app
// shell), RTL, styled like the transcript page. Auto-triggers the browser "Save as PDF" dialog;
// the produced file can be attached in email / WhatsApp.
export default async function TranscriptPrintPage({ params }: { params: { id: string } }) {
  const call = params.id === 'demo' ? await loadDemoCall() : await loadCompletedCall(params.id)
  if (!call) notFound()

  return (
    <div dir="rtl" style={{ background: '#fff', minHeight: '100vh', color: '#1a1a1a' }}>
      <style>{`@media print { .no-print { display: none !important } @page { margin: 1.4cm } } body { background: #fff }`}</style>
      <PrintTrigger label="הדפסה / שמירה כ-PDF" />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '52px 40px' }}>
        <header style={{ borderBottom: '1px solid #e8e8e6', paddingBottom: 20, marginBottom: 30 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>{call.companyName}</h1>
          <p style={{ fontSize: 14, color: '#888', marginTop: 6 }}>
            {call.quarter}
            {call.date ? ` · ${formatDate(call.date, 'he')}` : ''}
          </p>
        </header>

        {call.transcript.segments.map((seg) => (
          <div key={seg.id} style={{ marginBottom: 22, breakInside: 'avoid' }}>
            <div style={{ marginBottom: 5 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#C04A00' }}>{seg.speakerName}</span>
              {seg.role && <span style={{ fontSize: 12, color: '#999', marginInlineStart: 8 }}>{seg.role}</span>}
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.85, margin: 0 }}>{seg.words.map((w) => w.text).join(' ')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
