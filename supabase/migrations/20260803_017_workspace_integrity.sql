-- 20260803_017_workspace_integrity.sql
-- Three integrity holes in 016, closed additively.
--
-- Filed by a cold review that tested 016 BY EXECUTION against a real Postgres
-- rather than by reading it. Every one of these was ACCEPTED by the live
-- database before this migration; each line below has a rejected-now test in
-- the evidence for this branch.
--
-- ADDITIVE ONLY. All four tables held 0 rows when this was applied, so every
-- constraint validated instantly and no existing row could be invalidated.

-- ── 1. `kind` was decorative ────────────────────────────────────────────────
--
-- 016 had two rules that never met: `workspace_items_kind_check` constrained
-- kind to one of three words, and `workspace_items_one_source` required exactly
-- one provenance column. NOTHING tied them together, so kind='file' holding a
-- transcript_id and kind='transcript' holding a storage_path were both accepted.
--
-- That is not cosmetic. The UI reads `kind` to decide how to resolve a citation
-- anchor: a page number against a document, a line id against a transcript. A
-- row lying about its own kind means a block resolves its anchor against the
-- wrong source and renders a confident, wrong quote — the exact
-- "plausible-looking, not absent" failure the citation design exists to prevent.
alter table public.workspace_items
  add constraint workspace_items_kind_matches_source check (
    (kind = 'transcript' and transcript_id is not null) or
    (kind = 'document'   and document_id   is not null) or
    (kind = 'file'       and storage_path  is not null)
  );

-- ── 2. "the same source cannot sit on one shelf twice" was two-thirds true ──
--
-- 016 shipped partial unique indexes for transcript_id and document_id and
-- simply omitted storage_path, so a duplicate private file was accepted while
-- the comment above them claimed all three were covered. A comment asserting
-- more than the SQL enforces is the same defect class the 015 gate caught.
create unique index if not exists workspace_items_storage_uniq
  on public.workspace_items (workspace_id, storage_path)
  where storage_path is not null;

-- ── 3. A citation could reach across workspaces ─────────────────────────────
--
-- `workspace_doc_blocks_item_fk` binds (source_item_id, user_id), which proves
-- the block and the item share an OWNER but says nothing about sharing a
-- WORKSPACE. A block in workspace A citing an item sitting on the same user's
-- workspace B was accepted, so a working document could carry a citation to a
-- source that is not on its own shelf — and whose removal it would never see.
--
-- The old constraint cannot be removed (DROP is hook-blocked on this shared
-- database), but it does not need to be: a row must satisfy EVERY foreign key,
-- so the tighter one below is the binding rule and the older one is left
-- redundant rather than load-bearing.
--
-- Requires an otherwise-unnecessary unique on the referenced triple, exactly as
-- `unique (id, user_id)` was required in 016 — a foreign key must reference a
-- uniquely constrained column SET.
alter table public.workspace_items
  add constraint workspace_items_id_workspace_user_key unique (id, workspace_id, user_id);

-- ON DELETE SET NULL names its column for the same reason it does in 016: an
-- unqualified composite set-null would try to null workspace_id and user_id
-- too, both NOT NULL, and that fails at DELETE time rather than here.
--
-- MATCH SIMPLE (the default) means a NULL source_item_id satisfies this
-- regardless of the other two columns, so uncited blocks are unaffected — and
-- so is a block whose source was already released to null by 016's constraint.
alter table public.workspace_doc_blocks
  add constraint workspace_doc_blocks_item_workspace_fk
  foreign key (source_item_id, workspace_id, user_id)
  references public.workspace_items (id, workspace_id, user_id)
  on delete set null (source_item_id);
