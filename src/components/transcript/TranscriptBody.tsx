import { cn } from '@/lib/utils'
import type { Transcript, Speaker, SpeakerRole } from '@/lib/types'

interface TranscriptBodyProps {
  transcript: Transcript
}

const roleStyles: Record<SpeakerRole, { name: string; bar: string }> = {
  ceo: {
    name: 'text-white font-semibold',
    bar: 'bg-white/70',
  },
  cfo: {
    name: 'text-accent font-medium',
    bar: 'bg-accent',
  },
  analyst: {
    name: 'text-text-secondary font-medium',
    bar: 'bg-text-secondary/50',
  },
  moderator: {
    name: 'text-muted font-normal',
    bar: 'bg-muted/40',
  },
}

export function TranscriptBody({ transcript }: TranscriptBodyProps) {
  const speakerMap: Record<string, Speaker> = Object.fromEntries(
    transcript.speakers.map(s => [s.id, s])
  )

  return (
    <div className="space-y-8">
      {transcript.sections.map((section) => (
        <div key={section.id} id={section.id}>
          {/* Section heading */}
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted tracking-widest uppercase px-2">
              {section.title}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Lines */}
          <div className="space-y-1">
            {section.lines.map((line) => {
              const speaker = speakerMap[line.speakerId]
              const style = speaker ? roleStyles[speaker.role] : roleStyles.moderator

              return (
                <div
                  key={line.id}
                  className="group flex gap-4 py-4 px-4 rounded -mx-4 transcript-line hover:bg-white/[0.015] transition-colors"
                >
                  {/* Timestamp */}
                  <div className="flex-shrink-0 w-14 pt-0.5">
                    <span
                      className="text-2xs text-muted font-mono-num leading-none block"
                      dir="ltr"
                    >
                      {line.timestamp}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Speaker label */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn('w-0.5 h-4 rounded-full flex-shrink-0', style.bar)} />
                      <span className={cn('text-xs', style.name)}>
                        {speaker?.name ?? line.speakerId}
                      </span>
                      {speaker?.title && (
                        <span className="text-2xs text-muted">
                          — {speaker.title}
                        </span>
                      )}
                      {speaker?.affiliation && (
                        <span className="text-2xs text-muted">
                          | {speaker.affiliation}
                        </span>
                      )}
                    </div>

                    {/* Text */}
                    <p className="text-sm text-text-secondary leading-7">
                      {line.text}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
