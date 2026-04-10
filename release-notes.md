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
