# Evidence — MAYA is live, and the two blocked sessions were probing the wrong host

Founder, 2026-08-06, with two portal links: *"can you look at this page regarding the maya
api key not working and try to figure out why it doesn't work? since it says here the api
key is approved."*

He was right and the sessions before this one were wrong. **The key works. The base URL was
the defect.** Full contract in `docs/MAYA-API.md`; this sheet is the proof and the post-mortem.

---

## 1. What the portal said that no amount of probing could

Two pages, two facts, both decisive and neither derivable from outside:

- The app page: product **APPROVED** — on **"Atlas - second application"**, not on the app
  called "Atlas" whose credential is literally named `MAYA_API_KEY` and which is still
  **PENDING** with **0 requests**.
- The spec page, `Servers` dropdown: **`https://datawise.tase.co.il`**.

Every probe in this repo's history went to `openapigw.tase.co.il/tase/prod`. That host
answers an Imperva **503** to a real key, a bogus key and no key alike — which is why two
sessions of evidence-gathering produced nothing but confirmation that they had learned
nothing.

The dropdown is inside a `KONG-SWAGGER-UI` **shadow root**: `get_page_text` returned the
whole page without it, and `document.body.innerText.includes('datawise')` was `false` while
the string sat visible in a screenshot. It took walking `el.shadowRoot` to read it.

## 2. The call, and the controls that make it evidence

```
GET https://datawise.tase.co.il/api/v2/market-announcements/financial-report-schedule/event-types
    apikey: <MAYA_API_KEY>

real key   200  {"data":[{"financialReportTypeId":1,"financialReportType":"Conference Call"},…]}
no key     401  {"message":"No API key found in request"}
bogus key  401  {"message":"Unauthorized"}
```

**Three requests, three different answers.** That is the test the 503 could never pass: a
response identical for a valid and an invalid key is not evidence about the key. The
portal's request counter, which `docs/MAYA-API.md` had named as the arbiter, moved
**0 → 10** — and reported a 10% error rate matching exactly the one 400 triggered on
purpose by omitting required parameters.

## 3. The founder's actual scenario, run for real

`companies-disclosures/by-issuer?IssuerId=1460&FromDate=2026-01-01&ToDate=2026-08-06`
returned **45 Tigbur filings**, `meta.total 45, hasMore false`. Attachments: **37 `.htm`,
22 `.pdf`, 2 `.xbrl`**. Two rows carry event **270 מצגת (Presentation)** — the founder asked
for "reports and presentations" and both are there.

Then the part that matters, because a URL in a JSON payload is not a document:

```
GET https://mayafiles.tase.co.il/rpdf/1744001-1745000/P1744031-00.pdf   (no key, public)
    200  application/pdf  2,316,801 bytes  %PDF-1.7  →  41 pages

page 1: "מצגת לשוק ההון מאי 2026"
page 3: "קבוצת שירותים תפעוליים מבוססת חוזים ארוכי טווח והכנסות חוזרות בפריסה ארצית…"
```

Downloaded from MAYA and parsed with the repo's own pdfjs, Hebrew coming out clean and in
order. **The chain the "Jarvis moment" needs — feed → file → text — is proven end to end.**

## 4. Three traps found on the way, all of which would have shipped

**`Accept-Language: en-US` returns `title: null` on every row.** Not a locale preference —
the English feed has no titles. The same request with `he-IL` returns
`"מצגת משקיעים  - דוחות כספיים לרבעון הראשון של שנת 2026"`. A lane defaulting to English
would have built a shelf of untitled files and then synthesised labels out of event names,
inventing wording the issuer never wrote.

**`IssuerId` is not `tase_security_id`.** Tigbur is issuer **1460**, security **1105022** —
unrelated schemes. `companies.tase_issuer_id` is **NULL for all four rows**, so nothing in
Atlas can currently address a company to this API. The column exists; it needs a backfill,
not a migration.

**A 200 from mayafiles is not proof you got the file.** One fetch returned **200,
`text/html`, 212 bytes** — a WAF interstitial wearing a `.pdf` URL. Eight subsequent fetches
of the same URL returned the real 438 KB PDF, so it is intermittent, which is the dangerous
kind: an ingest trusting the status code stores a 212-byte "report", caches it, and renders
success. Validate `%PDF-` magic bytes. Same class as the 0-byte-PDF-pinned-by-cache incident
already filed in `.claude/rules/app.md`.

## 5. The post-mortem, which is the durable part

Two sessions concluded "still blocked on the founder" and filed increasingly confident
reasoning for it. The 503-vs-403 split was read as evidence that the subscription was not
provisioned. It was a real observation and the inference from it was wrong: the product had
been approved, on an app nobody had re-checked, and the 503 only ever meant *this is not
the address*.

**The base URL is configuration, and configuration is read from the system that issues it,
never deduced.** Seven hostnames were tried; the right one was not among them and could not
have been, because nothing outside the portal names it. The guide PDF had been extracted in
full — nine pages — specifically to settle this, and contains no hostname.

The founder said the key was approved. That was true. The disbelief was aimed at the wrong
component, because a 503 from a host the request never got past was allowed to stand in for
evidence about a key it had never reached. **This is the sibling of the rule this repo keeps
re-filing: a count in a document comes from a command — and a base URL comes from the
console that issues it, not from a document, a guess, or another service's published base.**

## Owed / not done

No code was written against MAYA. The ingest is a feature — per `rules/parallel-work.md`
it starts with a brainstorm and a spec, and it is the founder's call whether that is the
next thing. Everything from yesterday's sheet that was not about MAYA still stands.
