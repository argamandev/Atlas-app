// Turning a MAYA `company-details` row into the shape `public.companies` holds.
//
// PURE. No database, no network, no model — every decision here is a string
// decision, and every one of them is testable without a key.
import { MAYA_LOGO_BASE } from './config'
import type { MayaCompanyDetail } from './types'

/** What we are willing to write into a `companies` row. */
export type CompanyProfile = {
  issuerId: number
  /** The middle level of MAYA's hierarchy — the industry a person would name. */
  sector: string | null
  subSector: string | null
  description: string | null
  /** Absolute, scheme-qualified, safe to put in an href. */
  website: string | null
}

/**
 * MAYA pads `sector` to a fixed width with spaces and joins three levels with
 * `-`: `"ריאלי-מסחר ושרותים-שרותים          "`.
 *
 * WE STORE THE LOWER TWO AND DROP THE TOP. The top level is a two-value bucket
 * (`ריאלי` tangible / `הייטק` hi-tech) that says almost nothing about a
 * company; the second is the industry ("מסחר ושרותים", "טכנולוגיה") and the
 * third the specialisation ("שרותים", "תוכנה ואינטרנט"). `companies` has
 * exactly two columns for this, and those are the two worth having.
 *
 * `slice(2).join('-')` rather than `parts[2]`, because a sub-sector containing
 * a hyphen would otherwise be silently truncated to its first half — a wrong
 * label is worse than a missing one, and it would never look wrong on screen.
 */
export function parseSector(raw: string | null | undefined): {
  sector: string | null
  subSector: string | null
} {
  const parts = (raw ?? '')
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length === 0) return { sector: null, subSector: null }
  if (parts.length === 1) return { sector: parts[0]!, subSector: null }
  if (parts.length === 2) return { sector: parts[0]!, subSector: parts[1]! }
  return { sector: parts[1]!, subSector: parts.slice(2).join('-') }
}

/**
 * MAYA stores a bare host (`"www.tigbur.co.il"`), which is not a usable href —
 * a browser resolves it as a RELATIVE path, so an unqualified value renders a
 * link to `/app/company/www.tigbur.co.il`. That fails silently and looks like a
 * broken app rather than bad data.
 *
 * Refuses anything that is not plausibly a hostname. This is deliberately
 * conservative: MAYA's website column contains real errors — issuer 51
 * (הד ארצי) carries `www.ildc.co.il/lei_pro.html`, which is a DIFFERENT
 * company's site — and no syntactic check can catch that. What this can do is
 * refuse the junk it CAN see, and never manufacture a link out of a dash or a
 * phone number.
 */
export function normaliseWebsite(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v || v === '-' || v === '.') return null

  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  // A hostname needs a dot and a letter-ish TLD; this rejects "123", "n/a",
  // and the stray phone numbers that sit in free-text columns everywhere.
  if (!/^[\w-]+(\.[\w-]+)+$/.test(url.hostname)) return null
  if (!/\.[a-z]{2,}$/i.test(url.hostname)) return null
  return url.toString()
}

/** Empty, whitespace and placeholder dashes all mean "no description". */
export function normaliseDescription(raw: string | null | undefined): string | null {
  const v = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!v || v === '-') return null
  return v
}

export function toCompanyProfile(row: MayaCompanyDetail): CompanyProfile | null {
  // Without an issuer id the row cannot be matched to a company, and guessing
  // by name is exactly the ambiguity `tase_issuer_id` exists to remove.
  if (typeof row.issuerId !== 'number' || !Number.isFinite(row.issuerId)) return null
  const { sector, subSector } = parseSector(row.sector)
  return {
    issuerId: row.issuerId,
    sector,
    subSector,
    description: normaliseDescription(row.about),
    website: normaliseWebsite(row.website),
  }
}

/** `1460` → `https://mayafiles.tase.co.il/logos/he-IL/001460.jpg` */
export function mayaLogoUrl(issuerId: number | string): string {
  return `${MAYA_LOGO_BASE}/${String(issuerId).padStart(6, '0')}.jpg`
}

/**
 * Is this byte payload actually an image?
 *
 * THE CONTENT-TYPE LIES AND IS NOT CHECKED ANYWHERE HERE. Issuer 2356 is served
 * `content-type: image/jpeg` under a `.jpg` URL and is a PNG (measured
 * 2026-08-09). `docs/MAYA-API.md` also records a 200 from this host returning a
 * 212-byte WAF interstitial, so status and header both have to be treated as
 * decoration. Magic bytes are the only claim the file makes about itself.
 */
export function sniffImage(bytes: Uint8Array): 'jpeg' | 'png' | 'gif' | null {
  if (bytes.length < 8) return null
  const b = bytes
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
  return null
}

/**
 * How many companies must share one image before it is treated as a generic
 * placeholder rather than a logo.
 *
 * CLASSIFY BY UNIQUENESS, NOT BY A PINNED HASH. A hash pinned today stops
 * working the moment TASE re-saves its placeholder, and it fails OPEN — every
 * company would start showing the new grey square as its identity, with nothing
 * failing anywhere. Uniqueness re-derives the answer from the data on every
 * run: 13 companies sharing one byte-identical 2,037-byte PNG is not thirteen
 * logos (measured 2026-08-09).
 *
 * Three, not two, because a parent and its subsidiary can legitimately file
 * under the same mark. At three the sharing is a template, and the failure
 * direction is the safe one anyway — a missing logo shows a monogram, while a
 * wrong one asserts the wrong company.
 */
export const PLACEHOLDER_MIN_SHARERS = 3
