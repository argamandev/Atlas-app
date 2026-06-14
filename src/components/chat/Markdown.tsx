'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

// Renders a settled assistant reply as proper rich text (bold/italic/lists/tables/links/code)
// instead of raw markdown symbols. GFM gives us tables. dir="auto" + the `.md` typography
// (globals.css) keep it RTL-correct and Claude-clean. Links open in a new tab.
export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div dir="auto" className={cn('md', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
