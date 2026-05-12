import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'תמלול שיחות משקיעים',
  description: 'תמלול מקצועי לשיחות משקיעים — הדביקו קישור ליוטיוב וקבלו תמלול מלא ומדויק תוך דקות',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html dir="rtl" lang="he">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Hebrew:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg text-text-primary font-hebrew antialiased min-h-screen">
        {children}
      </body>
    </html>
  )
}
