import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { renameSpeakerInQuotes } from './quotes'

// Override map { [speakerId]: displayName } merged over the transcript's speakers at load.
export async function renameSpeaker(
  transcriptId: string,
  speakerId: string,
  newName: string,
  oldName: string,
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('transcripts')
    .select('speaker_names')
    .eq('id', transcriptId)
    .maybeSingle()
  const map = { ...((data?.speaker_names as Record<string, string> | null) ?? {}), [speakerId]: newName }
  const { error } = await supabaseAdmin.from('transcripts').update({ speaker_names: map }).eq('id', transcriptId)
  if (error) throw new Error(error.message)
  if (oldName && oldName !== newName) await renameSpeakerInQuotes(transcriptId, oldName, newName)
}
