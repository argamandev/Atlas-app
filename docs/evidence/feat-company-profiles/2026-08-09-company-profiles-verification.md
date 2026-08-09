# feat/company-profiles — verification

**What this slice does:** fills the five company-profile columns that have been empty since the
table was created, and puts the description, website and real logo on the company page.

**What it does NOT do:** no migration, no schema change, no new table. Every column already
existed and `lib/db/companies.ts` already read all five into the app — the company page has been
rendering `sector · sub_sector` against nulls all along. This slice supplies values.

## The data

`GET /v1/maya-reports-online/company-details`, no parameters — one request, 1,630 companies,
~1.3 MB. Registered by the founder on 2026-08-09 (`docs/MAYA-API.md`).

| | before | after |
|---|---|---|
| `sector` | 4 / 234 | **234 / 234** |
| `sub_sector` | 4 / 234 | **234 / 234** |
| `description` | 4 / 234 | **234 / 234** |
| `website` | 3 / 234 | **211 / 234** |
| `logo_url` | 3 / 234 | **220 / 234** |

Sync output, run twice (dry then live, identical counts):

```
FEED: 1630 companies from MAYA · 1630 usable · 0 without an issuer id
OURS: 234 rows · 233 carry an issuer id · 233 matched in the feed · 0 not in it
LOGOS: 220 real · 13 generic placeholder · 0 non-image 200s · 0 unreachable
WROTE: 230 companies touched
  sector       filled 230   left alone (already set) 3
  sub_sector   filled 230   left alone (already set) 3
  description  filled 230   left alone (already set) 3
  website      filled 208   left alone (already set) 3
  logo_url     filled 217   left alone (already set) 3
```

The arithmetic is consistent and worth stating, because "3 left alone" looked wrong against
"4 curated rows": the fourth curated company (תמיס) has **no `tase_issuer_id`**, so it is not in
the matched set at all. Likewise 220 real logos minus the 3 already-curated `logo_url`s = 217
filled.

## Decisions a reviewer should check

**Never overwrite a value a human wrote — per FIELD, not per row.** An empty column is filled, a
populated one is left alone and counted. Whether MAYA should eventually win is the founder's
call, and it cannot be made from data we have already overwritten.

**Placeholder logos are classified by UNIQUENESS, not by a pinned hash.** 13 companies share one
byte-identical 2,037-byte PNG; that is a template, not thirteen logos. A pinned hash would fail
OPEN the moment TASE re-saves its placeholder — every company would start showing the new grey
square as its identity with nothing failing anywhere. Uniqueness re-derives the answer each run.
Threshold is 3, not 2, because a parent and subsidiary can legitimately file under one mark; the
failure direction is safe either way, since a missing logo shows initials and a wrong one asserts
the wrong company.

**Images identified by magic bytes; the content-type is never consulted.** Issuer 2356 is served
`content-type: image/jpeg` under a `.jpg` URL and is a PNG. `docs/MAYA-API.md` also records this
host returning a 212-byte WAF page under a 200.

**`sector` is space-padded and hierarchical.** `"ריאלי-מסחר ושרותים-שרותים        "` → the top
level is a two-value bucket (tangible / hi-tech) and is dropped; the lower two become `sector`
and `sub_sector`, which are the two columns that exist. Sub-sectors containing a hyphen are
preserved via `slice(2).join('-')` — truncating would produce a wrong label that looks fine.

**Websites are normalised to absolute URLs.** MAYA stores a bare host (`www.tigbur.co.il`), which
a browser resolves as a RELATIVE path — the link would point at `/app/company/www.tigbur.co.il`
and fail silently.

## Verified in the browser, both locales

- **דניה סיבוס** (`8bc2e38d…`) — real logo, `נדל"ן ובנייה · בנייה`, Hebrew description, website
  `www.danya-cebus.co.il`. English and Hebrew both checked, zero console errors.
- **פרוספקט** (`978ecf04…`) — one of the 13 without a real logo: renders the **initials tile**,
  not a grey placeholder, and the website line is **absent** rather than empty.

**One defect found and fixed by measuring rather than looking.** The description started as
`<p dir="auto">`. `dir="auto"` resolved to RTL from the Hebrew and took ALIGNMENT with it, so on
the English page the description hugged x=1199 while its own website link sat at x=559 — one
paragraph flying to the far side of a left-aligned page. Fixed to `<p><bdi>…</bdi></p>`:
container keeps the page direction, `<bdi>` resolves the text's own. Re-measured — text and link
both start at 559, `<bdi>` still computes `direction: rtl`. This is the repo's most-filed bidi
rule and its fifth occurrence.

## Battery

`597 tests · 0 fail` (was 581 on `feat/maya-calendar`; +16 in `companyProfile.test.ts`,
registered in `package.json`). `npx tsc --noEmit` exit 0.

⚠️ **`npm run build` was NOT run** — a dev server is live in this checkout and they share one
`.next`, which is the documented way to break the running app. The reviewer should run it.

## Known limits, stated rather than discovered later

- **MAYA's `website` column contains real errors.** Issuer 51 (הד ארצי) carries
  `www.ildc.co.il/lei_pro.html`, which is a **different company's** site. No syntactic check can
  catch that; the parser refuses only junk it can see. We faithfully reproduce MAYA here, errors
  included, and 23 companies have no website at all.
- **14 companies show initials rather than a logo** — 13 placeholders plus תמיס, which has no
  issuer id. תמיס still renders via the name-based fallback in `resolveCompanyLogo`.
- **`securityIncludedIndices` is fetched but not stored.** Index membership with weights is in
  the response and would restore the index chips deleted as fabricated on `feat/maya-calendar`.
  It needs a table of its own, so it is deliberately out of this slice.
- **Contact details (phone, fax, email, address) are likewise available and unused.** The IR
  contact block deleted as invented could return as fact. Same reason: not this slice.
- **"Other companies" is still the first four rows the feed returns.** With sector now at 234/234
  a genuine "similar companies" query is possible; the honest name stays until it is written.
- **Nothing runs this on a schedule.** Same gap as the calendar sync — both are hand-run.
