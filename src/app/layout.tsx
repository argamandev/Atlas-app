import type { Metadata } from 'next'
import './globals.css'
import { getLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { getDirection } from '@/lib/i18n/config'
import { LocaleProvider } from '@/lib/i18n/LocaleProvider'

export const metadata: Metadata = {
  title: 'תמלול',
  description: 'Institutional-grade investor call intelligence.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = getLocale()
  const dir = getDirection(locale)
  const dict = getDictionary(locale)
  // English UI → Inter; Hebrew UI → Calibri Regular (with a Hebrew fallback stack).
  const fontClass = locale === 'he' ? 'font-calibri' : 'font-latin'

  return (
    <html dir={dir} lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Hebrew:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`bg-bg text-text-primary ${fontClass} antialiased min-h-screen`}>
        <LocaleProvider locale={locale} dict={dict}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  )
}
