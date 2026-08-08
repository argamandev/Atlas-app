/**
 * PUTTING A FRAGMENT INTO THE WORKING DOCUMENT — the one placement rule, used
 * from both sides of the pane boundary.
 *
 * Founder, 2026-08-05: *"you don't need to be sent into the document
 * automatically as a user."* Which means a passage can now be composed while the
 * document is not on screen at all — no pane, no contentEditable, no live DOM to
 * splice into. So the same algorithm has to work twice: on the mounted body when
 * there is one, and on the stored HTML string when there is not. Writing it
 * twice is how the two quietly stop agreeing about where "after this heading"
 * is.
 *
 * BROWSER-ONLY on purpose. It uses the DOM rather than parsing HTML by hand,
 * because the document holds figures, tables and nested lists, and a regex that
 * walks those is a bug with a delivery date. That also means it is not covered
 * by the node battery — the placement is verified in the browser instead, and
 * the parts that CAN be pure (the fragment builders in clip.ts, the sanitiser in
 * chat/compose.ts) are pure and tested.
 */

/** The tags Atlas may aim at with `afterHeading`. */
const HEADINGS = 'h1,h2,h3'

const isHeading = (n: Node): boolean => n.nodeType === 1 && /^H[1-3]$/.test((n as Element).tagName)

/**
 * Splice `fragment` into `body`, after the section owned by `afterHeading` (or
 * at the end). Returns the first node inserted, so a caller can scroll to it.
 *
 * "After the heading" means after everything under it — wedging the passage
 * between a heading and its own first paragraph is technically "after the
 * heading" and reads as a mistake a person made.
 */
export function insertIntoBody(
  body: HTMLElement,
  fragment: string,
  afterHeading: string | null
): HTMLElement | null {
  const holder = body.ownerDocument.createElement('div')
  holder.innerHTML = fragment
  const nodes = Array.from(holder.childNodes)
  if (nodes.length === 0) return null

  let anchor: Node | null = null
  if (afterHeading) {
    anchor =
      Array.from(body.querySelectorAll(HEADINGS)).find(
        (h) => (h.textContent ?? '').trim() === afterHeading
      ) ?? null
    if (anchor) {
      let next = anchor.nextSibling
      while (next && !isHeading(next)) {
        anchor = next
        next = next.nextSibling
      }
    }
  }

  if (anchor && anchor.parentNode) {
    let after: Node = anchor
    for (const node of nodes) {
      after.parentNode!.insertBefore(node, after.nextSibling)
      after = node
    }
  } else {
    for (const node of nodes) body.appendChild(node)
  }
  return nodes[0] as HTMLElement
}

/** The same placement, on stored HTML — for when the document pane is closed. */
export function spliceHtml(html: string, fragment: string, afterHeading: string | null): string {
  const holder = document.createElement('div')
  holder.innerHTML = html
  insertIntoBody(holder, fragment, afterHeading)
  return holder.innerHTML
}

/** The document as the model should see it: text, not markup. */
export function htmlToText(html: string): string {
  const holder = document.createElement('div')
  holder.innerHTML = html
  return (holder.innerText || holder.textContent || '').trim()
}

/** Headings Atlas is allowed to aim at — read from the document, never guessed. */
export function htmlHeadings(html: string): string[] {
  const holder = document.createElement('div')
  holder.innerHTML = html
  return Array.from(holder.querySelectorAll(HEADINGS))
    .map((h) => (h.textContent ?? '').trim())
    .filter(Boolean)
}
