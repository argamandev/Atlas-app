import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'

// Document reads for the app + chat grounding. Mission-5 design hook: the future
// company_knowledge layer slots in behind THIS interface (spec 2026-07-14) — callers never
// touch tables directly.

export const DOCUMENTS_BUCKET = 'company-documents'

export interface CompanyDocument {
  id: string
  companyId: string
  quarter: string
  docType: string
  title: string
  storagePath: string
  pageCount: number
  lang: string
}

type Row = {
  id: string
  company_id: string
  quarter: string
  doc_type: string
  title: string
  storage_path: string
  page_count: number
  lang: string
}

const fromRow = (r: Row): CompanyDocument => ({
  id: r.id,
  companyId: r.company_id,
  quarter: r.quarter,
  docType: r.doc_type,
  title: r.title,
  storagePath: r.storage_path,
  pageCount: r.page_count,
  lang: r.lang,
})

export async function getDocumentsFor(companyId: string, quarter: string): Promise<CompanyDocument[]> {
  const { data } = await supabaseAdmin
    .from('company_documents')
    .select('id, company_id, quarter, doc_type, title, storage_path, page_count, lang')
    .eq('company_id', companyId)
    .eq('quarter', quarter)
    .order('doc_type')
  return (data ?? []).map((r) => fromRow(r as Row))
}

export async function getDocumentMeta(id: string): Promise<CompanyDocument | null> {
  const { data } = await supabaseAdmin
    .from('company_documents')
    .select('id, company_id, quarter, doc_type, title, storage_path, page_count, lang')
    .eq('id', id)
    .maybeSingle()
  return data ? fromRow(data as Row) : null
}

export async function getPageText(
  documentId: string,
  pages: number[]
): Promise<{ pageNo: number; text: string }[]> {
  if (pages.length === 0) return []
  const { data } = await supabaseAdmin
    .from('document_pages')
    .select('page_no, text')
    .eq('document_id', documentId)
    .in('page_no', pages)
    .order('page_no')
  return (data ?? []).map((r) => ({ pageNo: r.page_no as number, text: r.text as string }))
}
