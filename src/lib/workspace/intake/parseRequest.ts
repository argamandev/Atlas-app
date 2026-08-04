import type { SourceRequest } from './types'

const KINDS = ['transcript', 'document'] as const
const YEAR_MIN = 1990
const YEAR_MAX = 2100

/** Models fence JSON in markdown often enough that stripping it is not a hack. */
function unfence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced ? fenced[1] : raw).trim()
}

function year(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null
  return v >= YEAR_MIN && v <= YEAR_MAX ? v : null
}

/**
 * Turn the model's answer into a SourceRequest.
 *
 * `interpreted: false` is the load-bearing part of this function, and the reason
 * it is a separate pure module rather than three lines inside the route.
 *
 * An unreadable answer must NOT degrade into an empty filter set, because an
 * empty filter set matches the WHOLE corpus — which the panel would then render
 * as "here is what I found for you" over what was really a failure to understand
 * the question. That is the exact silent-degradation class `.claude/rules/app.md`
 * exists to stop, and this chapter exists because it was shipped once already.
 *
 * The caller passes the user's own sentence as `fallbackText` so that a failed
 * interpretation still has something real to search with.
 */
export function parseModelRequest(raw: string, fallbackText: string): SourceRequest {
  const base: SourceRequest = {
    text: fallbackText,
    company: null,
    fromYear: null,
    toYear: null,
    kinds: null,
    interpreted: false,
  }

  let obj: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(unfence(raw))
    // An array parses fine and would then read every field as undefined, which
    // is indistinguishable from "the model declined to filter". It is not.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base
    obj = parsed as Record<string, unknown>
  } catch {
    return base
  }

  const company = typeof obj.company === 'string' && obj.company.trim() ? obj.company.trim() : null

  let fromYear = year(obj.fromYear)
  let toYear = year(obj.toYear)
  // A reversed range is a model slip, not a request for nothing.
  if (fromYear !== null && toYear !== null && fromYear > toYear) {
    ;[fromYear, toYear] = [toYear, fromYear]
  }

  const kinds = Array.isArray(obj.kinds)
    ? (obj.kinds.filter(
        (k): k is (typeof KINDS)[number] => typeof k === 'string' && (KINDS as readonly string[]).includes(k)
      ) as Array<'transcript' | 'document'>)
    : null

  return {
    text: fallbackText,
    company,
    fromYear,
    toYear,
    // `[]` collapses to null deliberately: findSources reads null as "no
    // preference", where an empty array would silently match nothing.
    kinds: kinds && kinds.length > 0 ? kinds : null,
    interpreted: true,
  }
}
