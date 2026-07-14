// The design's avatar language: a warm letter chip (#ECE9E2) with the entity's
// first character — used instead of logo images across the imported design
// (company header 48px, overview cards 38px, reported-results head 34px).
export function Monogram({
  name,
  size = 38,
  fontSize,
  radius,
  className = '',
}: {
  name: string
  size?: number
  fontSize?: number
  radius?: number
  className?: string
}) {
  const letter = name.trim().charAt(0) || '·'
  return (
    <span
      dir="auto"
      aria-hidden="true"
      className={`flex flex-none items-center justify-center bg-[#ECE9E2] text-ink ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.23),
        fontSize: fontSize ?? Math.round(size * 0.44),
      }}
    >
      {letter}
    </span>
  )
}
