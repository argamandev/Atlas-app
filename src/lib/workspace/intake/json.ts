// Reading JSON out of a model's answer, which is not the same job as JSON.parse.
//
// Both quirks here were observed against the real model on 2026-08-04, not
// imagined: markdown fencing, and a stray SECOND closing brace after an
// otherwise perfect object. Either one makes JSON.parse throw, and a thrown
// parse meant the user's request silently degraded to a keyword search.

/** Models fence JSON in markdown often enough that stripping it is not a hack. */
export function unfence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced ? fenced[1] : raw).trim()
}

/**
 * The first COMPLETE `{…}` in the text, brace-counted.
 *
 * Braces and quotes INSIDE string values are not structure, so the scan tracks
 * whether it is inside a string and honours backslash escapes.
 */
export function firstJsonObject(text: string): string | null {
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

/**
 * Parse a model answer into a plain object, or null.
 *
 * An ARRAY is rejected rather than unwrapped: `[{"a":1}]` contains a perfectly
 * good object, and picking it out would silently answer a shape we did not ask
 * for.
 */
export function modelObject(raw: string): Record<string, unknown> | null {
  const unfenced = unfence(raw)
  if (unfenced.startsWith('[')) return null

  const objectText = firstJsonObject(unfenced)
  if (objectText === null) return null

  try {
    const parsed: unknown = JSON.parse(objectText)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}
