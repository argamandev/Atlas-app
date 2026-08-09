// ─────────────────────────────────────────────────────────────────────────────
// ONE COMPANY-YEAR OF MAYA'S CATALOG, HELD BRIEFLY IN PROCESS MEMORY.
//
// THE RATE LIMIT IS THE BINDING CONSTRAINT HERE, not latency. 10 requests per 2
// seconds is ONE budget for our whole key, shared by every user and every
// consumer — `lib/maya/client.ts` is the single chokepoint and says so. Opening
// a year costs up to two requests (an annual report for 2024 is published in
// 2025, so the window spans both), and without this a second analyst opening
// the same company pays again for bytes we fetched seconds ago.
//
// PROCESS MEMORY, DELIBERATELY: this is a cache, not a store. A deploy or a
// second instance simply re-fetches. Nothing in the product may depend on a
// hit — a miss must always be correct, only slower.
// ─────────────────────────────────────────────────────────────────────────────

export const CATALOG_TTL_MS = 5 * 60 * 1000

type Entry = { at: number; value: unknown }

const store = new Map<string, Entry>()

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CATALOG_TTL_MS) {
    store.delete(key)
    return null
  }
  return hit.value as T
}

export function cacheSet<T>(key: string, value: T): void {
  store.set(key, { at: Date.now(), value })
}

/** Tests only — the cache is otherwise never cleared by hand. */
export function cacheClear(): void {
  store.clear()
}

/** The one key shape, so two call sites cannot disagree about it. */
export function catalogKey(issuerId: string | number, year: number): string {
  return `${issuerId}:${year}`
}
