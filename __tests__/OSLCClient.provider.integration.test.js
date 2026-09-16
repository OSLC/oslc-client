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
