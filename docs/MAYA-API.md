# MAYA / TASE Data Hub — what we have, what we are waiting for

Checked live 2026-08-05 against the founder's own portal account and the key in
this checkout. Everything below came from a command or a page, not from memory.

## Status: the key exists, the DATA does not — the subscription is PENDING

| | |
|---|---|
| Portal | <https://datahubapi.tase.co.il/> (account `sagi.arg@gmail.com`) |
| Apps | **Atlas** — one credential, named `MAYA_API_KEY` · **Atlas - second application** — no credential |
| Product both apps requested | **Market Announcements feed - MAYA 2.0.0** |
| Status of that product, on BOTH apps | **PENDING** |
| Requests in the last 30 days | **0** |
| Key in this repo | `MAYA_API_KEY` is set in `.env.local` (32 chars). Never printed, never committed. |

**So there is nothing to test against yet.** A key is issued the moment you create
a credential; it does not mean the data product has been granted. Until the
product flips from PENDING to approved, no endpoint of this product will answer.

**The approval is not automatic and does not come from clicking Register.** The
TASE guide (`Atlas Documents/MAYA API/maya_api-guide.pdf`, §04) states it plainly:
paid products "require commercial approval prior to activation", submitting the
portal request "does not automatically grant access", and completing activation
means contacting the Data Sales Team at **marketdatateam@tase.co.il**. API
support (technical, not commercial) is **apisupport@tase.co.il**.

## What we get when it is approved

Auth for this app, per the portal's own app page: **Application Auth Strategy =
API Key Auth**, **Key Name = `apikey`** — i.e. the key travels in an `apikey`
request header, not as a bearer token.

Endpoints in the product (`GET`, all of them):

| Path | What it is for Atlas |
|---|---|
| `/api/v2/market-announcements/companies-disclosures/by-issuer` | every MAYA disclosure of one issuer — the company's filing history |
| `/api/v2/market-announcements/financial-report-schedule/by-schedule-date` | who reports on a given date — **the Calendar feed** |
| `/api/v2/market-announcements/financial-report-schedule/by-report-year` | the same schedule keyed by report year |
| `/api/v2/market-announcements/financial-report-schedule/event-types` | lookup: `eventId` / `eventName` |
| `/api/v2/market-announcements/financial-report-schedule/period-types` | lookup: `periodTypeId` / `periodType` |

Gateway host (TASE's published base, unverified against a live 200 because we
have never had one): `https://openapigw.tase.co.il/tase/prod` + the path above.
**Do not treat the base URL as settled** — see the next section.

Rate limits, from the guide: **10 requests / 2 seconds**, burst the same; over it
you get HTTP 429.

## The probe, and why its result proves nothing about the key

Node and curl both get **HTTP 503 with an Imperva/Incapsula bot-mitigation page**
from `openapigw.tase.co.il` — identically **with the real key, with a deliberately
bogus key, and with no key at all**, and at the gateway root as well as at the
product paths. A response that is the same for a valid and an invalid key is not
evidence about the key; it is evidence that the request never reached the API.
Either the WAF refuses non-browser clients from here, or the base URL/path prefix
is not the one this product sits behind.

Both readings are consistent with the portal saying **0 requests**: nothing we
sent has ever been counted as an API call.

⇒ **Re-test after the product is approved, and use the portal's own "Try it out"
first** (it shows the exact host and headers for a working call, and the portal
enables it once the product is granted). Do not conclude anything about the key
from a 503 here.

## When it lands, where it goes in Atlas

Decided 2026-08-01 (`agent-memory/cross-cutting.md`): **MAYA reports become
`company_documents`** — no new parallel tables. Company data is shared corpus,
not per-user (`docs/DATA-MODEL.md`). The intake path that will read the catalog
is flagged in `src/lib/workspace/intake/corpus.ts`, and the ingest core that a
MAYA auto-fetch is meant to reuse is `src/lib/documents/ingest.ts`.

The `financial-report-schedule` endpoints are the first thing worth wiring: the
Calendar currently shows `scheduled_calls` only, and "who reports when" is
exactly this feed.

## Repro

`node <scratchpad>/check-maya.mjs` — loads `.env.local` through `@next/env`,
prints variable NAMES and lengths only (never a value), then probes the gateway
and prints statuses. The scratchpad copy is disposable; the method matters more
than the file: **never let a secret value into a transcript, a log, or a commit.**
