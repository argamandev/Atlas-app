'use client'

import { ChatView } from '@/components/chat/ChatView'
import { ProjectView } from '@/components/projects/ProjectView'

// A single project, drawn inside the chat surface exactly as the design has it.
//
// ChatView owns the conversation engine — streaming, persistence, citations,
// history — and hands its `send` down through renderMain, so the project's own
// composer drives the real thing rather than a second implementation. Passing
// projectId is what makes the chat inherit this project's instructions, memory
// and notes, and what stamps the saved conversation with project_id so it lists
// under this project instead of the global recents.
//
// WHY THIS WRAPPER EXISTS — do not inline it back into the route file:
// `renderMain` is a FUNCTION, and a Server Component may not pass a function to
// a Client Component. React refuses to serialize it ("Functions cannot be
// passed directly to Client Components…") and the whole page 500s before it
// renders. Neither tsc nor next build catches it — the rule is enforced at
// render time. The closure therefore has to be created on the CLIENT side of
// the boundary: the route passes a plain string, this component makes the
// callback. (Filed 2026-08-02, found by the founder clicking "New project".)
export function ProjectChat({ projectId }: { projectId: string }) {
  return (
    <ChatView
      initialCompany={null}
      projectId={projectId}
      renderMain={({ send, sending, open }) => (
        <ProjectView projectId={projectId} onSend={send} onOpenChat={open} sending={sending} />
      )}
    />
  )
}
