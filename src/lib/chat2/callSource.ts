// ─────────────────────────────────────────────────────────────────────────────
// THE IMPURE HALF OF WHOLE-CALL INJECTION — one Supabase read, kept out of
// `callInjection.ts` so the builder (and everything that tests it) stays pure.
//
// This is the same split `toolDefs.ts` / `tools.ts` makes and for the same
// reason: `@/lib/supabase` constructs a client at module load and throws without
// live env vars, so a static import would make the loop untestable. `loop.ts`
// imports this lazily, and only on a call-grounded turn.
//
// `supabaseAdmin` IS CORRECT HERE, and it is worth saying why rather than
// leaving it to look like the usual shortcut. Transcripts are SHARED CORPUS —
// readable in full by every authenticated member (docs/DATA-MODEL.md, migration
// 20260801_014), which is the founder decision that makes Atlas a platform
// rather than a per-user transcription tool. So there is no owner to filter by,
// and this reads the same row through the same client the old `/api/chat` route
// read it through (`lib/chat/context.ts`). The caller is already
// authenticated: `/api/chat/v2` resolves a user before anything else runs.
// ─────────────────────────────────────────────────────────────────────────────

// NO `import 'server-only'`, and that is the same decision `tools.ts` documents
// one directory over rather than an oversight. `server-only` resolves ONLY
// inside Next's build, so a static import makes this module unloadable from any
// plain node process — which is exactly what `scripts/measure-chat-answer.mjs`
// is, and it failed on precisely this while measuring the stuffed turn. The
// loop's dynamic import turned that into a visible `error` event rather than an
// ungrounded answer (the honesty machinery working), but a module the
// measurement harness cannot load is a module whose cost cannot be measured.
// What keeps this server-side is that only the loop imports it, and only lazily.
import { supabaseAdmin } from '@/lib/supabase'
import type { Transcript } from '@/lib/types'
import type { CallForInjection } from './callInjection'

/**
 * Load one call for injection. `null` = no such call (deleted, or never existed);
 * a thrown error = the read itself failed. The loop distinguishes them only in
 * the message it shows, because both mean the same thing to the user: the call
 * their screen names did not reach the model.
 */
export async function loadCallForInjection(transcriptId: string): Promise<CallForInjection | null> {
  const { data, error } = await supabaseAdmin
    .from('transcripts')
    .select('id, formatted_data')
    .eq('id', transcriptId)
    .maybeSingle()
  // NOT dropped on the floor: supabase never throws, so an ignored `error` here
  // would read as "no such call" and the surface would say the call is gone when
  // the database merely blinked (supabaseReadDiscipline.test.ts).
  if (error) throw new Error(error.message)
  const fd = data?.formatted_data as Transcript | null | undefined
  if (!fd) return null
  return {
    id: (data?.id as string) ?? transcriptId,
    company: fd.company,
    quarter: fd.quarter,
    date: fd.date,
    speakers: fd.speakers,
    sections: fd.sections,
  }
}
