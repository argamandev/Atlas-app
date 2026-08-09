import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSector,
  normaliseWebsite,
  normaliseDescription,
  toCompanyProfile,
  mayaLogoUrl,
  sniffImage,
} from './companyProfile'

// ── sector ───────────────────────────────────────────────────────────────────
// Every string below is a real value from the live feed on 2026-08-09, padding
// included. The padding is the point: it is invisible in a console and would
// sit inside the stored value forever.

test('the three-level hierarchy keeps the lower two', () => {
  assert.deepEqual(parseSector('ריאלי-מסחר ושרותים-שרותים                    '), {
    sector: 'מסחר ושרותים',
    subSector: 'שרותים',
  })
  assert.deepEqual(parseSector('הייטק-טכנולוגיה-תוכנה ואינטרנט'), {
    sector: 'טכנולוגיה',
    subSector: 'תוכנה ואינטרנט',
  })
})

test('a space after the separator is not part of the name', () => {
  // Real value: "ריאלי- השקעה ואחזקות-השקעה ואחזקות"
  const { sector } = parseSector('ריאלי- השקעה ואחזקות-השקעה ואחזקות')
  assert.equal(sector, 'השקעה ואחזקות')
  assert.equal(sector, sector!.trim())
})

test('a hyphen inside a sub-sector name survives', () => {
  // Truncating here would produce a WRONG label that looks perfectly fine.
  assert.deepEqual(parseSector('הייטק-טכנולוגיה-ביו-טכנולוגיה'), {
    sector: 'טכנולוגיה',
    subSector: 'ביו-טכנולוגיה',
  })
})

test('missing or malformed sector yields nulls, never an empty string', () => {
  for (const bad of [null, undefined, '', '   ', '-', '--']) {
    assert.deepEqual(parseSector(bad), { sector: null, subSector: null })
  }
})

test('fewer than three levels still drop the top-level bucket', () => {
  // A lone value has no hierarchy to strip, so it stands as the label.
  assert.deepEqual(parseSector('ריאלי'), { sector: 'ריאלי', subSector: null })
  // TWO parts must not store the bucket as the industry. This asserted the
  // opposite until the supervisor caught the function disagreeing with its own
  // docstring. No live row currently has two levels (measured 0 of 234), so the
  // test is the only thing holding the rule.
  assert.deepEqual(parseSector('ריאלי-תעשייה'), { sector: 'תעשייה', subSector: null })
  assert.notEqual(parseSector('ריאלי-תעשייה').sector, 'ריאלי')
})

// ── website ──────────────────────────────────────────────────────────────────

test('a bare host becomes an absolute url', () => {
  // Unqualified, a browser resolves this as a RELATIVE path — the link would
  // point at /app/company/www.tigbur.co.il and fail silently.
  assert.equal(normaliseWebsite('www.tigbur.co.il'), 'https://www.tigbur.co.il/')
})

test('an existing scheme is respected, not doubled', () => {
  assert.equal(normaliseWebsite('http://example.co.il'), 'http://example.co.il/')
  assert.equal(normaliseWebsite('https://example.co.il/path'), 'https://example.co.il/path')
})

test('junk never becomes a link', () => {
  for (const bad of [null, undefined, '', '   ', '-', '.', 'n/a', '03-5762120', 'localhost']) {
    assert.equal(normaliseWebsite(bad), null, `${JSON.stringify(bad)} must not become a link`)
  }
})

test('a path on a real host is kept', () => {
  // Issuer 51 really does carry this, and it is another company's site. No
  // syntactic check can know that — the point of the test is to record that
  // this SHAPE is accepted, so the limitation is visible rather than assumed.
  assert.equal(normaliseWebsite('www.ildc.co.il/lei_pro.html'), 'https://www.ildc.co.il/lei_pro.html')
})

// ── description ──────────────────────────────────────────────────────────────

test('description collapses whitespace and refuses placeholders', () => {
  assert.equal(
    normaliseDescription('החברה עוסקת בשירותי כח-אדם  וסיעוד\nושירותי שמירה.'),
    'החברה עוסקת בשירותי כח-אדם וסיעוד ושירותי שמירה.'
  )
  for (const bad of [null, undefined, '', '  ', '-']) assert.equal(normaliseDescription(bad), null)
})

// ── the row → profile mapping ────────────────────────────────────────────────

test('a row without a usable issuerId is refused, not guessed by name', () => {
  assert.equal(toCompanyProfile({ issuerName: 'תיגבור' } as never), null)
  assert.equal(toCompanyProfile({ issuerId: NaN } as never), null)
})

test('a real row maps end to end', () => {
  const p = toCompanyProfile({
    issuerId: 1460,
    issuerName: 'קבוצת תיגבור בע"מ',
    sector: 'ריאלי-מסחר ושרותים-שרותים                    ',
    about: 'החברה עוסקת בשירותי כח-אדם וסיעוד ושירותי שמירה ואבטחה.',
    website: 'www.tigbur.co.il',
  })
  assert.deepEqual(p, {
    issuerId: 1460,
    sector: 'מסחר ושרותים',
    subSector: 'שרותים',
    description: 'החברה עוסקת בשירותי כח-אדם וסיעוד ושירותי שמירה ואבטחה.',
    website: 'https://www.tigbur.co.il/',
  })
})

test('a sparse row yields nulls rather than empty strings', () => {
  // 625 of 1,630 rows carry no website; nothing here may invent one.
  assert.deepEqual(toCompanyProfile({ issuerId: 51 }), {
    issuerId: 51,
    sector: null,
    subSector: null,
    description: null,
    website: null,
  })
})

// ── logos ────────────────────────────────────────────────────────────────────

test('the logo path is the issuer id padded to six', () => {
  assert.equal(mayaLogoUrl(1460), 'https://mayafiles.tase.co.il/logos/he-IL/001460.jpg')
  assert.equal(mayaLogoUrl('51'), 'https://mayafiles.tase.co.il/logos/he-IL/000051.jpg')
})

test('images are identified by magic bytes, because the content-type lies', () => {
  // Issuer 2356 is served `image/jpeg` under a .jpg URL and is a PNG.
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])), 'jpeg')
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png')
  assert.equal(sniffImage(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0])), 'gif')
})

test('an HTML interstitial served as a .jpg is not an image', () => {
  // A 200 from mayafiles is not proof of a file — docs/MAYA-API.md records a
  // 212-byte WAF page wearing a .pdf URL. Same class, same host.
  const html = new TextEncoder().encode('<html><head><title>Request Rejected')
  assert.equal(sniffImage(html), null)
  assert.equal(sniffImage(new Uint8Array([])), null)
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8])), null) // truncated
})
