-- Multi-view backend M1 (Lane M): real documents behind the Report/Slides facet panes.
-- company_documents = one row per company+quarter+type document (PDF in the private
-- 'company-documents' Storage bucket); document_pages = per-page extracted text (the chat
-- grounding + future Mission-5 company_knowledge feedstock). Additive only; the legacy
-- foreign 'documents' table (empty, old repo) is deliberately untouched.

create table if not exists public.company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  quarter text not null,
  doc_type text not null default 'report',
  title text not null,
  source text not null default 'manual',
  storage_path text not null,
  page_count int not null,
  lang text not null default 'he',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, quarter, doc_type)
);
create index if not exists company_documents_company_quarter_idx
  on public.company_documents(company_id, quarter);

create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.company_documents(id) on delete cascade,
  page_no int not null,
  text text not null,
  unique (document_id, page_no)
);
create index if not exists document_pages_document_idx on public.document_pages(document_id);

alter table public.company_documents enable row level security;
alter table public.document_pages enable row level security;

-- Signed-in users read; writes only via service role (which bypasses RLS).
drop policy if exists company_documents_read on public.company_documents;
create policy company_documents_read on public.company_documents
  for select to authenticated using (true);
drop policy if exists document_pages_read on public.document_pages;
create policy document_pages_read on public.document_pages
  for select to authenticated using (true);
