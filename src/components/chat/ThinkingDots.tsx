// Pre-first-token "thinking" indicator — three staggered bouncing dots. Shared by the
// main chat and the in-transcript side chat (Features 5 + 6).
export function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5" aria-label="thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}
