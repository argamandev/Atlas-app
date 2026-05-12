interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({
  title = 'שגיאה בעיבוד',
  description = 'אירעה שגיאה בעת עיבוד התמלול. ודאו שהקישור תקין ונסו שוב.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full border border-error/30 bg-error/5 flex items-center justify-center mb-5">
        <svg className="w-6 h-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-text-primary mb-1.5">{title}</h3>
      <p className="text-xs text-muted max-w-xs leading-relaxed mb-5">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-accent hover:text-accent-hover transition-colors border border-accent/20 hover:border-accent/40 px-4 py-2 rounded"
        >
          נסה שוב
        </button>
      )}
    </div>
  )
}
