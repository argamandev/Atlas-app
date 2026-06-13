-- Persist call audio + IVRIT per-word timings on transcripts, powering the live
-- karaoke + audio-sync page for YouTube/IVRIT calls. Applied to production via MCP on
-- 2026-06-13. word_segments holds the normalized IvritSegment[] (text/start/end/speaker/words).
alter table public.transcripts
  add column if not exists audio_url text,
  add column if not exists word_segments jsonb;
