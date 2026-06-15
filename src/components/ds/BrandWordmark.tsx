import { cn } from '@/lib/utils'

// Atlas brand wordmark. Renders the trimmed transparent logo
// (public/brand/atlas-wordmark.png) as a CSS mask filled with `currentColor`,
// so it inherits the surrounding text color — ink on light surfaces, light on
// dark — stays transparent on any background, and scales crisply at any size.
// The color comes from CSS (not the asset), so there is never a baked-in
// background rectangle. Set the color via a text-* class on `className`.
//
// Aspect comes from the trimmed asset (398×135); regenerate it (and this number,
// if the logo changes) with `node scripts/prep-brand-assets.mjs`.
const ASPECT = 2.948

export function BrandWordmark({
  height = 18,
  className,
  title = 'Atlas',
}: {
  height?: number
  className?: string
  title?: string
}) {
  const mask = {
    WebkitMaskImage: 'url(/brand/atlas-wordmark.png)',
    maskImage: 'url(/brand/atlas-wordmark.png)',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  } as const
  return (
    <span
      role="img"
      aria-label={title}
      className={cn('inline-block bg-current align-middle', className)}
      style={{ height, width: Math.round(height * ASPECT), ...mask }}
    />
  )
}
