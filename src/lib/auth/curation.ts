// The curation-gate DECISION, split from its IO so every branch — including the non-admin
// 403 — is executed by a unit test (curationAuthz.test.ts) instead of trusted by shape.
// `requireAdmin` in src/lib/auth.ts owns resolving the caller and reading profiles.role;
// this function owns the verdict, and profiles.role === 'admin' is the only admissible
// evidence (docs/DATA-MODEL.md, "Writes to the shared corpus are CURATION").
//
// Fail-closed on purpose: an unknown, missing or null role is 'forbidden', never 'ok'.
export type CurationVerdict = 'unauthorized' | 'forbidden' | 'ok'

export function curationVerdict(userId: string | null, role: string | null | undefined): CurationVerdict {
  if (!userId) return 'unauthorized'
  return role === 'admin' ? 'ok' : 'forbidden'
}

// The HTTP meaning of each refusal, kept beside the decision so the pair is tested together:
// 'ok' maps to no refusal at all.
export const CURATION_REFUSAL_STATUS: Record<Exclude<CurationVerdict, 'ok'>, number> = {
  unauthorized: 401,
  forbidden: 403,
}
