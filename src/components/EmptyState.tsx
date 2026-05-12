interface EmptyStateProps {
  title?: string
  description?: string
}

export function EmptyState({
  title = 'אין תמלולים עדיין',
  description = 'הדביקו קישור YouTube כדי להתחיל את התמלול הראשון שלכם',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full border border-border bg-card flex items-center justify-center mb-5">
        <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-text-primary mb-1.5">{title}</h3>
      <p className="text-xs text-muted max-w-xs leading-relaxed">{description}</p>
    </div>
  )
}
