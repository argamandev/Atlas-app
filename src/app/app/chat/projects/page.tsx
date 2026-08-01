import { ChatView } from '@/components/chat/ChatView'
import { ProjectsList } from '@/components/projects/ProjectsList'

// Projects list. The design draws Projects inside the chat surface (its secondary
// panel stays visible), so the route renders ChatView with the list as its main
// view rather than as a separate page. Data comes from the session demo state,
// which the /app layout seeded from lib/projects/data.ts.
export default function ProjectsPage() {
  return <ChatView initialCompany={null} mainView={<ProjectsList />} />
}
