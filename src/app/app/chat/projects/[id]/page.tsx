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
export default function ProjectPage({ params }: { params: { id: string } }) {
  return (
    <ChatView
      initialCompany={null}
      projectId={params.id}
      renderMain={({ send, sending }) => (
        <ProjectView projectId={params.id} onSend={send} sending={sending} />
      )}
    />
  )
}
