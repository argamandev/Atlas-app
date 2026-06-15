'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn, detectDir } from '@/lib/utils'

// remark plugin: render <br> tags as real line breaks. Gemini emits <br> for multi-line table
// cells (GFM tables can't hold real newlines), but react-markdown v9 doesn't parse raw HTML —
// so the literal "<br>" text leaks into the cell. This walks the parsed tree and turns <br>
// (whether it arrived as an inline `html` node or as literal text) into mdast `break` nodes,
// which render as proper <br/> elements. Self-contained (no unist-util-visit dep) and it only
// ever touches <br> — every other raw HTML tag stays escaped, so it adds no XSS surface.
function remarkRenderBreaks() {
  const isBr = (v: string) => /^<br\s*\/?>$/i.test(v.trim())
  const hasBr = /<br\s*\/?>/i
  const splitBr = /<br\s*\/?>/gi
  const walk = (node: any) => {
    if (!Array.isArray(node.children)) return
    const out: any[] = []
    for (const child of node.children) {
      if (child.type === 'html' && isBr(child.value)) {
        out.push({ type: 'break' })
      } else if (child.type === 'text' && hasBr.test(child.value)) {
        const parts = child.value.split(splitBr)
        parts.forEach((part: string, i: number) => {
          if (i > 0) out.push({ type: 'break' })
          if (part) out.push({ type: 'text', value: part })
        })
      } else {
        walk(child)
        out.push(child)
      }
    }
    node.children = out
  }
  return (tree: any) => walk(tree)
}

// Renders a settled assistant reply as proper rich text (bold/italic/lists/tables/links/code)
// instead of raw markdown symbols. GFM gives us tables. The wrapper's direction is chosen from
// the content (detectDir) — not dir="auto" — so a Hebrew reply reads RTL and its tables put the
// first column on the far right, while an English reply stays LTR. The `.md` typography
// (globals.css) keeps it Claude-clean. Links open in a new tab.
export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div dir={detectDir(content)} className={cn('md', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkRenderBreaks]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
