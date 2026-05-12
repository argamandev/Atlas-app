import { cn } from '@/lib/utils'
import type { TranscriptStatus } from '@/lib/types'

interface BadgeProps {
  status: TranscriptStatus
  className?: string
}

const statusConfig: Record<TranscriptStatus, { label: string; classes: string; dot: string }> = {
  processing: {
    label: 'בתהליך',
    classes: 'bg-status-processing/10 text-status-processing border-status-processing/30',
    dot: 'bg-status-processing animate-pulse',
  },
  completed: {
    label: 'הושלם',
    classes: 'bg-success/10 text-success border-success/30',
    dot: 'bg-success',
  },
  failed: {
    label: 'נכשל',
    classes: 'bg-error/10 text-error border-error/30',
    dot: 'bg-error',
  },
}

export function Badge({ status, className }: BadgeProps) {
  const config = statusConfig[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border',
        config.classes,
        className
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', config.dot)} />
      {config.label}
    </span>
  )
}
