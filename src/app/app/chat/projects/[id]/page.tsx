import { ChatView } from '@/components/chat/ChatView'
import { ProjectView } from '@/components/projects/ProjectView'

// A single project. The id may name a demo project OR one created this session,
// so resolution happens client-side against the session demo state (a server-side
// notFound() would reject projects the user just created).
export default function ProjectPage({ params }: { params: { id: string } }) {
  return <ChatView initialCompany={null} mainView={<ProjectView projectId={params.id} />} />
}
