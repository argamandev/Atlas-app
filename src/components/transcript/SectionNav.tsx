'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { TranscriptSection } from '@/lib/types'

interface SectionNavProps {
  sections: TranscriptSection[]
}

export function SectionNav({ sections }: SectionNavProps) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' }
    )

    for (const section of sections) {
      const el = document.getElementById(section.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [sections])

  function scrollTo(id: string) {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <nav className="sticky top-6 self-start">
      <p className="text-2xs text-muted uppercase tracking-widest mb-3 font-medium">ניווט</p>
      <div className="space-y-0.5">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => scrollTo(section.id)}
            className={cn(
              'w-full flex items-center gap-2.5 text-right px-3 py-2 rounded text-xs transition-colors',
              activeId === section.id
                ? 'bg-accent/10 text-accent'
                : 'text-muted hover:text-text-secondary hover:bg-white/5'
            )}
          >
            <span className={cn(
              'w-0.5 h-3.5 rounded-full flex-shrink-0 transition-colors',
              activeId === section.id ? 'bg-accent' : 'bg-border'
            )} />
            {section.title}
          </button>
        ))}
      </div>

      {/* Line count */}
      <div className="mt-5 pt-4 border-t border-border">
        {sections.map((section) => (
          <div key={section.id} className="flex justify-between items-center py-0.5">
            <span className="text-2xs text-muted">{section.title}</span>
            <span className="text-2xs text-muted font-mono-num" dir="ltr">
              {section.lines.length} שורות
            </span>
          </div>
        ))}
      </div>
    </nav>
  )
}
