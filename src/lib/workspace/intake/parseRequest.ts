import type { SourceRequest } from './types'

const KINDS = ['transcript', 'document'] as const
const YEAR_MIN = 1990
const YEAR_MAX = 2100

/** Models fence JSON in markdown often enough that stripping it is not a hack. */
function unfence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced ? fenced[1] : raw).trim()
}

/**
 * The first COMPLETE `{…}` in the text, brace-counted.
 *
 * Not defensive programming for its own sake — observed against the real model on
 * 2026-08-04: with `responseMimeType: 'application/json'`, gemini-3.5-flash
 * returned a valid object followed by a stray second closing brace
 * (`{ … "toYear": 2019 }\n}\n`). `JSON.parse` rejects the whole string, so a
 * perfectly good interpretation was thrown away and the request degraded to a
 * keyword search — silently, which is the failure mode this module exists to
 * prevent.
 *
 * Braces and quotes INSIDE string values are not structure, so the scan tracks
 * whether it is inside a string and honours backslash escapes.
 */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      // Only meaningful inside a string, and harmless outside one.
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
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

  // An ARRAY is rejected before the object scan rather than after: `[{"a":1}]`
  // contains a perfectly good `{…}`, and picking it out would silently answer a
  // shape we did not ask for.
  const unfenced = unfence(raw)
  if (unfenced.startsWith('[')) return base

  const objectText = firstJsonObject(unfenced)
  if (objectText === null) return base

  let obj: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(objectText)
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
