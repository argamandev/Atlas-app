import { mayaGet, type MayaGetOptions } from './client'
import { MAYA_MIN_REQUEST_GAP_MS, PATH_DISCLOSURES_BY_ISSUER } from './config'
import { yearWindows } from './dates'
import type { MayaEnvelope, MayaFiling, MayaResult } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// One issuer's filing catalog over a span of years.
//
// SEVERAL CALLS, NOT ONE. MAYA refuses any window wider than a year, and a
// request for "2024" needs 2025 as well because that is when a 2024 annual
// report is published. `yearWindows` owns both rules; this function owns the
// consequence — that a catalog is assembled rather than fetched.
//
// SEQUENTIAL, because the 10-requests-per-2-seconds limit is one budget for our
// whole key, shared by every user and every consumer. Fanning four windows out
// in parallel would be four tenths of that budget spent in one instant by one
// analyst.
//
// A FAILING WINDOW FAILS THE WHOLE CALL. Returning the windows that happened to
// succeed would hand the selection step a catalog missing a year, and it has no
// way to know that — so "Tigbur has no 2024 annual report" would be produced
// with total confidence out of a network blip. Partial coverage presented as
// complete is the failure this layer exists to make impossible.
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type ListDisclosuresArgs = {
  issuerId: number
  fromYear: number
  toYear: number
}

export async function listDisclosures(
  a: ListDisclosuresArgs,
  opts: MayaGetOptions = {}
): Promise<MayaResult<MayaFiling[]>> {
  const windows = yearWindows(a.fromYear, a.toYear)
  const byId = new Map<number, MayaFiling>()

  for (let i = 0; i < windows.length; i++) {
    if (i > 0) await sleep(MAYA_MIN_REQUEST_GAP_MS)

    const w = windows[i]
    const res = await mayaGet<MayaEnvelope<MayaFiling>>(
      PATH_DISCLOSURES_BY_ISSUER,
      { IssuerId: a.issuerId, FromDate: w.from, ToDate: w.to },
      opts
    )
    if (!res.ok) return { ok: false, failure: res.failure }

    // Windows are adjacent, not overlapping, but a filing corrected across a
    // boundary can appear twice; the report id is the identity that settles it.
    for (const f of res.data.data ?? []) {
      if (f && typeof f.mayaReportId === 'number') byId.set(f.mayaReportId, f)
    }
  }

  // Array.from rather than a spread: this repo's tsconfig target predates
  // iterating a Map directly.
  const data = Array.from(byId.values()).sort((x, y) =>
    x.publicationDate < y.publicationDate ? 1 : x.publicationDate > y.publicationDate ? -1 : 0
  )
  return { ok: true, data }
}
