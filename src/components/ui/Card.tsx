import { cn } from '@/lib/utils'

interface CardProps {
  className?: string
  children: React.ReactNode
  hover?: boolean
}

export function Card({ className, children, hover }: CardProps) {
  return (
    <div
      className={cn(
        'bg-card border border-border rounded',
        hover && 'transition-colors duration-150 hover:border-[#2a2a2a] hover:bg-[#141414]',
        className
      )}
    >
      {children}
    </div>
  )
}
