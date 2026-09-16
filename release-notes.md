## 4.2.0

- **`options.getAuthorization`** — supply an `Authorization` header from the host, for servers
  that accept only bearer tokens. Called before every request; return `null` to use the
  existing mechanisms for that URL. The library caches nothing; providers must be single-flight.
- **`CredentialRejectedError`** — raised when a host-supplied credential is rejected, after one
  forced refresh, or when the provider itself throws. Never falls back to Basic auth, which
  previously turned an expired token into an opaque `AUTH_EXHAUSTED`.
- A request the provider authenticated now has `config.auth` cleared, so axios cannot overwrite
  the supplied header with Basic credentials.

# 4.1.1

Incoming-links fixes. Against ELM 7.1.0 SR1, `getIncomingLinks()` could not
succeed with any `ldmBaseUrl` setting; these are the three reasons why.

- `X-Jazz-CSRF-Prevent` is now added by a request interceptor on every
  POST/PUT/DELETE/PATCH, routed through `_csrfHeaders()` so requests prefer the
  JSESSIONID value over the `'1'` placeholder. Previously it was set per call
  site, and `#getIncomingLinksViaLdm` never set it — so every `/discover-links`
  POST got a 403 (CRLQE0629E). A caller-supplied value still wins.
- Endpoint selection no longer keys off `ldmBaseUrl.includes('/lqe')`. The
  `/incoming-links` REST API (servlet mapping `/incoming-links`, ELM 7.1.0+) is
  served by both LQE and LDX, while `/discover-links` is the unrelated OSLC LDM
  specification endpoint. The old test decided by URL spelling AND exclusively,
  so an `/ldx` base was sent only to `/discover-links` (which LDX does not
  serve) and an `/lqe` base only to `/incoming-links`. Both candidates are now
  tried; the URL only ORDERS them, and the endpoint that answers is remembered
  so the probe runs once per client rather than per query.
- Auth no longer takes the blame for non-auth failures. The basic-auth and
  interactive-SSO branches wrapped the retried request in a try/catch that
  labelled anything it caught as that mechanism failing, then fell through to
  `AUTH_EXHAUSTED`. A 403 CSRF therefore surfaced as "Basic auth failed", then
  "Interactive SSO callback failed", then `AUTH_EXHAUSTED` — three misleading
  messages, none naming the cause. New `_retryAfterAuth()`: a retry rejection
  with a status other than 401 is definitive and is surfaced unchanged; only 401
  or a transport error falls through to the next mechanism. JEE-forms and
  JAS-bearer are unchanged — they own their handshakes, so attributing failure
  to the mechanism is accurate there.
- `LDMClient` errors preserve `error.response`, and a plain-text error body is
  reported instead of the bare axios message. LQE returns `text/plain` for some
  failures, so reading only `response.data.error` discarded explanations like
  "Configuration <uri> does not exist in the index or is not a configuration".
- When no endpoint answers, the FIRST candidate's failure is reported rather than
  the last, so the informative message survives instead of the fallback
  endpoint's generic 404.

CONSUMER NOTE: the error-propagation change is the one behavioural difference
that could surprise existing code. A non-auth failure on a request that
triggered authentication (403, 404, 5xx) now propagates to the caller instead of
being converted into an `AUTH_EXHAUSTED` rejection.

# 4.1.0

Write-path extensions for generic OSLC CRUD clients (Resource Navigator):

- New `errors.js` module: `OSLCError` (status, statusText, serverMessage, url),
  `PreconditionFailedError` (412), `ConflictError` (409), and `oslcErrorFrom()`.
  Write methods (`putResource`, `createResource`, `deleteResource`) now throw typed errors. Exported from the package root.
- `putResource(resource, eTag?)`: when `eTag` is omitted, `resource.etag` is used
  as `If-Match` automatically (pass `'*'` for unconditional update); the response
  `ETag` is written back to `resource.etag` on success.
- `X-Jazz-CSRF-Prevent` is now sent on PUT and POST-create, matching DELETE.
- `createResource` throws a clear `OSLCError` when the server returns success
  without a `Location` header.
- `deleteResource` also accepts a plain URL string.
- `ServiceProvider`: new `getCreationFactories(resourceType?)`,
  `getCreationDialogs(resourceType?)`, `getSelectionDialogs(resourceType?)`
  returning full descriptor lists ({url, resourceTypes, resourceShape, label,
  title, hintWidth, hintHeight, usages}) — `usages` lets consumers identify
  special dialogs such as the genoslc Add Link dialog (advertised as a standard
  selection dialog with a distinguishing `oslc:usage`). Existing single-match
  `getCreationFactory` is unchanged.
- Regression tests lock the `Configuration-Context` header onto all write methods.

oslc-client 4.0.0 — Unified browser/Node.js architecture

Breaking Changes:

- LDMClient is now a composition helper, not a subclass of OSLCClient.
  Constructor changed from new LDMClient(user, password, configContext, ldmBaseUrl, options)
  to new LDMClient(oslcClient, ldmBaseUrl). Consumers should use
  OSLCClient.getIncomingLinks() instead of creating LDMClient directly.

- Browser mode uses fetch adapter instead of XMLHttpRequest. Axios configured
  with adapter: 'fetch' in browser environments. This changes redirect handling
  behavior — redirects are no longer followed transparently by default on
  auth-related requests.

New Features:

- OSLCClient.getIncomingLinks(targetUrls, linkTypes) — get incoming links
  directly from OSLCClient. Delegates to LDMClient internally. Requires
  ldmBaseUrl in constructor options. Returns already-inverted links.

- ldmBaseUrl constructor option — configure the LDM/LQE server URL when
  creating an OSLCClient. If not set, getIncomingLinks() returns [].

- Browser-compatible bundling — removed top-level await that prevented
  esbuild/webpack from bundling. Node.js modules loaded lazily via
  ensureNodeModules() / _ensureInitialized().

Auth Improvements:

- Fetch adapter for browser mode — uses adapter: 'fetch' instead of
  XMLHttpRequest. Enables per-request redirect control for j_security_check,
  making JEE Forms auth work from browsers.

- JEE Forms auth in browser — j_security_check POST uses redirect: 'manual'
  to capture response cookies without following the redirect.

- SSO callback on authrequired — interactive SSO callback now fires on
  authrequired responses (not just 401), so it works as a fallback when
  JEE Forms and Basic auth fail.

Bug Fixes:

- SPARQL JSON response parsing for LQE Jena-backed incoming links
- LQE 401 handling — let auth interceptor handle LQE 401s
