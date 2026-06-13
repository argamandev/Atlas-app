import { getLocale } from '@/lib/i18n/server'
import { getCompany } from '@/lib/db/companies'
import { supabaseAdmin } from '@/lib/supabase'
import { companyDisplayName } from '@/lib/api/types'
import { ChatView } from '@/components/chat/ChatView'

// ChatView owns its own collapsible "Chats" panel (history + agents/skills), so the page
// just resolves any initial context (company / quote / transcript) and renders it.
export default async function ChatPage({
  searchParams,
}: {
  searchParams: { company?: string; quote?: string; transcript?: string }
}) {
  const locale = getLocale()

  let initialCompany: { id: string; name: string; logoUrl: string | null } | null = null
  if (searchParams.company) {
    const c = await getCompany(searchParams.company)
    if (c) initialCompany = { id: c.id, name: companyDisplayName(c, locale), logoUrl: c.logoUrl }
  }
  // searchParams values are already URL-decoded by Next.
  const initialQuote = searchParams.quote ?? null

  // Transcript-scoped context (✦ "open in chat" from a specific call).
  let initialTranscript: { id: string; label: string } | null = null
  if (searchParams.transcript) {
    const { data } = await supabaseAdmin
      .from('transcripts')
      .select('id, formatted_data')
      .eq('id', searchParams.transcript)
      .maybeSingle()
    const fd = data?.formatted_data as { company?: string; quarter?: string } | undefined
    if (fd) initialTranscript = { id: data!.id as string, label: `${fd.company ?? ''} · ${fd.quarter ?? ''}`.trim() }
  }

  return (
    <ChatView initialCompany={initialCompany} initialQuote={initialQuote} initialTranscript={initialTranscript} />
  )
}
