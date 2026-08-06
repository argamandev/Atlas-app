-- 018 — REDUNDANT. APPLIED IN ERROR. DO NOT REPLAY THIS ANYWHERE.
--
-- This file is kept because the statements below WERE applied to the shared
-- database on 2026-08-06, and the migration record has to match what the
-- database actually contains. Everything it creates already existed.
--
-- WHAT WAS WRONG. Migration 017 (2026-08-03, "workspace integrity") had already
-- created workspace_items_transcript_uniq, workspace_items_document_uniq and
-- workspace_items_storage_uniq — the transcript and document ones with the
-- IDENTICAL definition to the two below. So this migration added a second,
-- duplicate unique index over each of two columns. They enforce nothing new;
-- they cost write time and storage on every insert.
--
-- HOW IT HAPPENED, because the shape of the mistake is the reusable part. The
-- pre-flight check was real and its result was correct (zero violating pairs).
-- The check that was NOT run was "does this index already exist" — and when it
-- was finally run, it was run as `indexname like 'workspace_items_unique%'`,
-- a pattern matching only the names ABOUT TO BE CREATED. The 017 originals are
-- named `..._uniq`, so the query that was supposed to detect the collision was
-- shaped so that it could not. Listing every index on the table takes the same
-- one query and cannot lie by omission.
--
-- The premise underneath was wrong too, and that is the deeper error. This was
-- written to stop a duplicate shelf row that was believed to have been observed
-- in the browser. It had not been: the two rows were compared on the FIRST EIGHT
-- CHARACTERS of their transcript ids, printed by a debugging helper that
-- truncated them. The full ids were `PyuMxe88e8g` and `PyuMxe88e8g_live` — two
-- genuinely different transcripts of the SAME investor call, one recorded on
-- 3 June and one captured live on 16 July. The database had been enforcing
-- uniqueness correctly the whole time. An identifier compared on a prefix is not
-- compared at all.
--
-- WHAT IS ACTUALLY WRONG, and it is a real problem this uncovered: the CORPUS
-- holds that call twice, under two ids with the same `youtube_title`, and the
-- same is true of "דוח דירקטוריון Q1 2026" (two `company_documents` rows). A
-- shelf can therefore show two entries a person cannot tell apart, and the chat
-- cites files by title, so "according to דוח דירקטוריון Q1 2026" is ambiguous.
-- No index fixes that; it is a de-duplication question about the corpus and it
-- belongs to the founder.
--
-- REMOVAL IS OWED AND IS HOOK-BLOCKED. `drop index` is refused by
-- .claude/hooks/pre-bash-gate.mjs on both doors, which is the guard working as
-- intended on a database shared with production Timlul. The two indexes below
-- are therefore still live. Removing them is safe — the 017 originals still
-- enforce the constraint, proved by a duplicate insert being refused with
-- `workspace_items_transcript_uniq` AFTER these were created — but it is the
-- founder's call, not something to route around at night.

create unique index if not exists workspace_items_unique_transcript
  on public.workspace_items (workspace_id, transcript_id)
  where transcript_id is not null;

create unique index if not exists workspace_items_unique_document
  on public.workspace_items (workspace_id, document_id)
  where document_id is not null;
