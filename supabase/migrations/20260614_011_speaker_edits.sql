-- Diarization editing (Feature 1): a manual speaker-segmentation overlay on a finished
-- transcript. Purely additive + nullable — when absent, loadCall produces the exact same
-- derived segmentation as before (no regression for existing transcripts).
--
-- Shape: { "boundaries": [ { "atWordIndex": <int>, "speakerId": <string> }, ... ] }
-- An ordered list of split points over the flat word stream; the speaker of word i is the
-- speakerId of the latest boundary with atWordIndex <= i. Word timings are never touched, so
-- the karaoke highlight is unaffected — only the speaker turns/labels change.
alter table public.transcripts
  add column if not exists speaker_edits jsonb;
