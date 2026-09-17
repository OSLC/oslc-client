// __tests__/OSLCClient.provider.integration.test.js
import http from 'node:http';
import OSLCClient from '../OSLCClient.js';

/** A server that accepts exactly one bearer token and records what it was sent. */
function startServer(acceptToken) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers.authorization ?? null);
    if (req.headers.authorization === `Bearer ${acceptToken}`) {
      res.writeHead(200, { 'Content-Type': 'text/turtle' });
      res.end('# ok');
      return;
    }
    res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="test"' });
    res.end();
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}/r` }));
  });
}

describe('provider over a real socket', () => {
  let ctx;
  afterEach(() => ctx?.server.close());

  it('attaches the provider header to a real request', async () => {
    ctx = await startServer('GOOD');
    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => 'Bearer GOOD',
    });

    const response = await client.client.get(ctx.url);

    expect(response.status).toBe(200);
    expect(ctx.seen).toEqual(['Bearer GOOD']);
  });

  it('is not clobbered by the Basic branch when the server first refuses', async () => {
    ctx = await startServer('GOOD');
    let calls = 0;
    const client = new OSLCClient('u', 'p', null, {
      // First answer is stale; the refresh supplies the one the server accepts.
      getAuthorization: async ({ forceRefresh }) => {
        calls++;
        return forceRefresh ? 'Bearer GOOD' : 'Bearer STALE';
      },
    });

    const response = await client.client.get(ctx.url);

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    // Never a Basic header: config.auth must not survive the interceptor.
    expect(ctx.seen).toEqual(['Bearer STALE', 'Bearer GOOD']);
    expect(ctx.seen.some(h => h?.startsWith('Basic '))).toBe(false);
  });

  it('raises CredentialRejectedError when the refreshed credential is refused too', async () => {
    ctx = await startServer('GOOD');
    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => 'Bearer WRONG',
    });

    await expect(client.client.get(ctx.url)).rejects.toMatchObject({
      name: 'CredentialRejectedError',
      status: 401,
      wwwAuthenticate: 'Bearer realm="test"',
    });
  });

  it('leaves a declining provider to the built-in mechanisms', async () => {
    ctx = await startServer('NEVER');
    const client = new OSLCClient('u', 'p', null, { getAuthorization: async () => null });

    // Basic is attempted and refused, so this ends in the usual exhausted rejection —
    // the point is that the ladder ran at all.
    await expect(client.client.get(ctx.url)).rejects.toBeDefined();
    expect(ctx.seen.some(h => h?.startsWith('Basic '))).toBe(true);
  });
});

/**
 * A server driven by a caller-supplied handler, recording (method, path, authorization) for
 * every request it sees.
 */
function startHandlerServer(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({
      method: req.method,
      path: req.url,
      authorization: req.headers.authorization ?? null,
    });
    handler(req, res);
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      resolve({ server, seen, origin, url: path => `${origin}${path}` });
    });
  });
}

describe('provider-authenticated requests are not cut off from the rest of dispatch', () => {
  const servers = [];
  afterEach(() => { while (servers.length) servers.pop().close(); });

  async function serve(handler) {
    const ctx = await startHandlerServer(handler);
    servers.push(ctx.server);
    return ctx;
  }

  // maxRedirects: 0 makes dispatch branch 3 the ONLY redirect-following path in the library.
  // While the provider stand-down sat ahead of every branch, a provider-authenticated request
  // stopped following redirects: the 302 came back to the caller, and getResource — which
  // throws only at >= 400 — read it as if it were the resource.
  it('follows a redirect, and the redirected hop carries the credential', async () => {
    const ctx = await serve((req, res) => {
      if (req.url === '/redir') {
        res.writeHead(302, { Location: '/final' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/turtle' });
      res.end('# final');
    });

    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => 'Bearer T',
    });

    const response = await client.client.get(ctx.url('/redir'));

    expect(response.status).toBe(200);
    expect(response.data).toBe('# final');
    expect(ctx.seen.map(r => r.path)).toEqual(['/redir', '/final']);
    expect(ctx.seen.map(r => r.authorization)).toEqual(['Bearer T', 'Bearer T']);
  });

  // The other half of branch 3, and the reason the stand-down cannot simply be "follow every
  // redirect": a 3xx whose Location resolves to a known IdP is an SSO challenge wearing a
  // redirect's clothes. Followed, it reaches _handleSsoAuth, which replays userid/password or
  // calls ssoCallback — the fallback the seam exists to prevent. '/oauth2/authorize' is one of
  // the library's IDP_PATTERNS; the case above, '/final', is not.
  it('raises CredentialRejectedError on a redirect to an IdP, and never calls ssoCallback', async () => {
    const ctx = await serve((req, res) => {
      res.writeHead(302, { Location: '/oauth2/authorize?client_id=elm&response_type=code' });
      res.end();
    });

    let ssoCallbackCalls = 0;
    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => 'Bearer T',
      ssoCallback: async () => { ssoCallbackCalls += 1; return null; },
    });

    await expect(client.client.get(ctx.url('/r'))).rejects.toMatchObject({
      name: 'CredentialRejectedError',
      // The status the server actually sent — a 302, not a 401.
      status: 302,
      url: ctx.url('/r'),
    });

    expect(ssoCallbackCalls).toBe(0);
    // One forced refresh and nothing more: the IdP URL itself was never fetched.
    expect(ctx.seen.map(r => r.path)).toEqual(['/r', '/r']);
    expect(ctx.seen.every(r => r.authorization === 'Bearer T')).toBe(true);
  });

  // ELM's JEE-forms challenge is not a 401: it is a 200 carrying the auth-msg header and a
  // login page as its body. Returned to the caller it would be parsed as RDF.
  it('raises CredentialRejectedError on a JEE-forms challenge instead of returning the login page', async () => {
    const ctx = await serve((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'x-com-ibm-team-repository-web-auth-msg': 'authrequired',
      });
      res.end('<html><form><input type="password" name="j_password"></form></html>');
    });

    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => 'Bearer T',
      ssoCallback: () => { throw new Error('ssoCallback must not run for a provider-authenticated request'); },
    });

    await expect(client.client.get(ctx.url('/r'))).rejects.toMatchObject({
      name: 'CredentialRejectedError',
      url: ctx.url('/r'),
    });

    // One forced refresh, and nothing else: no j_security_check POST, no Basic credentials.
    expect(ctx.seen.map(r => r.path)).toEqual(['/r', '/r']);
    expect(ctx.seen.every(r => r.authorization === 'Bearer T')).toBe(true);
  });

  // Every other provider test drives client.client directly, which is the one path that never
  // runs _ensureInitialized() — so nothing exercised `this.client = wrapper(this.client)`.
  it('carries the credential through the public getResource API', async () => {
    const ctx = await serve((req, res) => {
      if (req.headers.authorization !== 'Bearer T') {
        res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="test"' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/turtle', ETag: '"v1"' });
      res.end('<urn:thing> <http://purl.org/dc/terms/title> "a resource" .');
    });

    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => 'Bearer T',
    });

    const resource = await client.getResource(ctx.url('/r'));

    expect(resource.getURI()).toBe(ctx.url('/r'));
    expect(resource.etag).toBe('"v1"');
    expect(ctx.seen.map(r => r.authorization)).toEqual(['Bearer T']);
  });

  // The stand-down is per request rather than per client precisely because one axios instance
  // serves more than one host — LDMClient points oslcClient.client at an LQE/LDX server.
  it('authenticates one host and leaves the other to the built-in ladder, on one client', async () => {
    const bearerHost = await serve((req, res) => {
      if (req.headers.authorization === 'Bearer T') {
        res.writeHead(200, { 'Content-Type': 'text/turtle' });
        res.end('# bearer ok');
        return;
      }
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer realm="test"' });
      res.end();
    });
    const basicHost = await serve((req, res) => {
      if (req.headers.authorization?.startsWith('Basic ')) {
        res.writeHead(200, { 'Content-Type': 'text/turtle' });
        res.end('# basic ok');
        return;
      }
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="test"' });
      res.end();
    });

    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async ({ url }) => (url.startsWith(bearerHost.origin) ? 'Bearer T' : null),
    });

    const bearerResponse = await client.client.get(bearerHost.url('/r'));
    const basicResponse = await client.client.get(basicHost.url('/r'));

    expect(bearerResponse.data).toBe('# bearer ok');
    expect(basicResponse.data).toBe('# basic ok');
    expect(bearerHost.seen.map(r => r.authorization)).toEqual(['Bearer T']);
    // The host the provider declined got the 4.1.1 ladder — and never the other host's token.
    expect(basicHost.seen.map(r => r.authorization)[0]).toBeNull();
    expect(basicHost.seen[1].authorization.startsWith('Basic ')).toBe(true);
  });

  // A redirect config is cloned from the previous hop, so it arrives carrying that hop's
  // Authorization. When the provider declines for the new host, that credential must not go.
  it('does not carry one host\'s credential onto a redirect the provider declined', async () => {
    const other = await serve((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/turtle' });
      res.end('# other');
    });
    const start = await serve((req, res) => {
      res.writeHead(302, { Location: `${other.origin}/final` });
      res.end();
    });

    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async ({ url }) => (url.startsWith(start.origin) ? 'Bearer T' : null),
    });

    const response = await client.client.get(start.url('/r'));

    expect(response.data).toBe('# other');
    expect(start.seen.map(r => r.authorization)).toEqual(['Bearer T']);
    expect(other.seen.map(r => r.authorization)).toEqual([null]);
  });
});
