import * as React from 'react'

// Full-screen app frame: the nav rail + content fill the viewport edge-to-edge.
// (No floating window / desktop backdrop / window chrome — this is a real webapp.)
export function MacWindowFrame({ nav, children }: { nav: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas text-ink">
      {nav}
      {children}
    </div>
  )
}
