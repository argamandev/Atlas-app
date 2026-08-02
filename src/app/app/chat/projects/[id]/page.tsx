import { ProjectChat } from '@/components/projects/ProjectChat'

// The route stays a Server Component and passes a plain string; all the chat
// wiring lives in ProjectChat, which is a Client Component because the wiring
// needs a callback. See the comment there before changing this file.
export default function ProjectPage({ params }: { params: { id: string } }) {
  return <ProjectChat projectId={params.id} />
}
