import { LandingNav } from '@/components/layout/LandingNav'
import { TickerBar } from '@/components/landing/TickerBar'
import { HeroSection } from '@/components/landing/HeroSection'
import { FeatureCards } from '@/components/landing/FeatureCards'
import { TranscriptPreview } from '@/components/landing/TranscriptPreview'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg">
      <LandingNav />
      <TickerBar />

      {/* Offset for fixed nav (56px) + fixed ticker (32px) */}
      <div className="pt-[88px]">
        <HeroSection />
        <FeatureCards />
        <TranscriptPreview />

        {/* Footer */}
        <footer className="border-t border-border">
          <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
            <p className="font-mono-num text-2xs text-muted tracking-wide">
              © 2026 SENTINEL // MARKET INTELLIGENCE · כל הזכויות שמורות
            </p>
            <div className="flex items-center gap-4">
              <span className="font-mono-num text-2xs text-muted tracking-widest uppercase">STATUS: OPERATIONAL</span>
              <span className="font-mono-num text-2xs text-muted" dir="ltr">v4.2.1</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
