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

## RE-CHECKED 2026-08-05 AFTER THE FOUNDER REPORTED THE KEY APPROVED — still no call reaches TASE, and the reason is now NARROWER

Founder, 2026-08-05: *"the api key was approved so check it!"* Re-ran the probe
against all five endpoints of the product, both plausible bases, with the `apikey`
header and a browser user-agent. Result, unchanged and uniform:

| Host | Result |
|---|---|
| `openapigw.tase.co.il/tase/prod` + any of the 5 paths | **503, Imperva/Incapsula bot page**, every time |
| `datahubapi.tase.co.il` + the same paths | **404 with real JSON** (`{"message":"Cannot GET …"}`) |

The second row matters: TASE is reachable from here and that host is a working
app server — it is simply the PORTAL, not the gateway, so the product paths are
not on it. Only `openapigw.tase.co.il` is refusing.

**The hypothesis this file carried — "the WAF refuses non-browser clients from
here" — is now REFUTED.** Navigating the founder's own Chrome, on his own
machine and network, to
`https://openapigw.tase.co.il/tase/prod/api/v2/market-announcements/financial-report-schedule/event-types`
returns the SAME Incapsula 503, and a same-origin `fetch()` from that page
returns `{status: 503, waf: true}`. A real browser is refused exactly like a
script, so the client was never the variable.

What is left, and neither can be settled from this machine:

1. **The base URL is not the one this product sits behind.** `openapigw.tase.co.il/tase/prod`
   is TASE's published base for its OTHER products; nothing has ever confirmed it
   for Market Announcements. This is the likeliest answer and the cheapest to
   settle — the portal's "Try it out" prints the exact host it calls.
2. **TASE's WAF blocks this network or region outright**, in which case a deployed
   Atlas may be fine and only local development is blind.

**Blocked on the founder, and it is a 2-minute job:** the portal session has
expired (`datahubapi.tase.co.il/my-apps` redirects to `Continue with SSO`), and
signing in is not something an assistant session may do. Sign in, open the
**Atlas** app, and report two things: whether *Market Announcements feed - MAYA
2.0.0* still says **PENDING**, and what host the **Try it out** console actually
calls. Either answer unblocks this immediately.

⇒ **Still true, and now for a sharper reason: nothing about the key has been
tested.** Not one request has reached the API, so "approved" and "working" remain
different claims. The request count in the portal is the arbiter.

## RE-CHECKED AGAIN 2026-08-06 — seven bases now, and the 503/403 split is the new evidence

Founder, 2026-08-06: *"check the maya api key works."* Re-ran the probe. Unchanged:
`openapigw.tase.co.il` returns the Imperva 503 with the real key, a bogus key and
no key at all. Then the search widened, and two things came back that are worth
keeping.

**`openapi.tase.co.il` 301-redirects to `datahub.tase.co.il`** — a host this repo
had never tried. It is a marketing page: every product path on it 302s to
`www.tase.co.il/he/content/products_lobby/datahub`. Not the gateway. Also tried,
all refused or wrong: `api.tase.co.il`, `apigw.tase.co.il`, `datahub.tase.co.il`,
`datahub.tase.co.il/tase/prod`, `datahubapi.tase.co.il/tase/prod` (returns the
portal's own SPA HTML — a catch-all route, not an API).

**The status codes differ, and that is the actual finding.** `api.tase.co.il`,
`apigw.tase.co.il` and `mayaapi.tase.co.il` return Incapsula **403** — the WAF
refusing a client. `openapigw.tase.co.il` returns **503**, which from Incapsula
means the ORIGIN behind it is unreachable or not configured, not that we are
blocked. Those are different failures. A 503 is consistent with the gateway
simply not being provisioned for this account or product — i.e. consistent with
PENDING — and it is NOT consistent with "the WAF is refusing us", which the
browser test already refuted.

⇒ This raises the odds that nothing is wrong with the key, the host or the code,
and that the subscription genuinely has not been activated. It does not prove it.

**The guide has no base URL in it.** `Atlas Documents/MAYA API/maya_api-guide.pdf`
was extracted in full (9 pages, via pdfjs) specifically to settle this: it covers
registration, apps, credentials, rate limits and error codes, and never once
states a hostname. The portal's "Try it out" console remains the only place the
real base URL can be read.

**Still blocked on the founder, still two minutes, and now the only open branch:**
sign in at `datahubapi.tase.co.il`, open the **Atlas** app, and report (a) whether
*Market Announcements feed - MAYA 2.0.0* still says **PENDING**, and (b) what host
"Try it out" calls. Nothing on this machine can settle either.

**Nothing about the key has been tested.** Two sessions of probing, zero requests
counted by the portal.

## The original probe, and why its result proves nothing about the key

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
