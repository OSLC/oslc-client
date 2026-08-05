/**
 * Unit tests for Jazz CSRF protection on mutating requests.
 *
 * Regression context: Jazz rejects POST/PUT/DELETE without an
 * X-Jazz-CSRF-Prevent header (CRLQE0629E, HTTP 403). The header was applied
 * per-call-site, so LDMClient's /discover-links POST — which never set it —
 * got a 403 on every incoming-links query, while the sibling /incoming-links
 * POST hardcoded '1'. A single request interceptor cannot be forgotten by a
 * new call site.
 */
import { jest } from '@jest/globals';

// Mock rdflib: LDMClient parses RDF responses, which we do not exercise here.
jest.unstable_mockModule('rdflib', () => {
  const mockStore = {
    statementsMatching: jest.fn(() => []),
    any: jest.fn(() => null),
    querySync: jest.fn(() => []),
  };
  const Namespace = jest.fn((ns) => (localName) => `${ns}${localName || ''}`);
  const sym = jest.fn((uri) => ({ value: uri, termType: 'NamedNode' }));
  return {
    graph: jest.fn(() => mockStore),
    parse: jest.fn(),
    Namespace,
    sym,
    default: { graph: jest.fn(() => mockStore), parse: jest.fn(), Namespace, sym },
  };
});

const { default: OSLCClient } = await import('../OSLCClient.js');
const { default: LDMClient } = await import('../LDMClient.js');

const CSRF = 'X-Jazz-CSRF-Prevent';

/** Read a header from an axios config, whether AxiosHeaders or a plain object. */
function header(config, name) {
  const h = config?.headers;
  if (!h) return undefined;
  return typeof h.get === 'function' ? h.get(name) : h[name];
}

/**
 * Replace the adapter so no network happens, and capture every request config.
 * Returns the array the configs land in.
 */
function captureRequests(client, respond = () => ({ status: 200, headers: {}, data: '' })) {
  const seen = [];
  client.client.defaults.adapter = async (config) => {
    seen.push(config);
    const { status, headers, data } = respond(config);
    return { status, statusText: 'OK', headers, config, data };
  };
  return seen;
}

describe('Jazz CSRF header on mutating requests', () => {
  test.each(['post', 'put', 'delete', 'patch'])(
    'adds %s CSRF header',
    async (method) => {
      const client = new OSLCClient('user', 'pass');
      const seen = captureRequests(client);

      await client.client.request({
        url: 'https://server.example.com/ldx/discover-links',
        method,
        data: 'body',
      });

      expect(seen).toHaveLength(1);
      expect(header(seen[0], CSRF)).toBe('1');
    }
  );

  test('does not add the header to GET requests', async () => {
    const client = new OSLCClient('user', 'pass');
    const seen = captureRequests(client);

    await client.client.get('https://server.example.com/rm/resource/1');

    expect(seen).toHaveLength(1);
    expect(header(seen[0], CSRF)).toBeUndefined();
  });

  test('does not clobber a value the caller set explicitly', async () => {
    const client = new OSLCClient('user', 'pass');
    const seen = captureRequests(client);

    await client.client.post('https://server.example.com/rm/resource/1', 'body', {
      headers: { [CSRF]: 'caller-supplied' },
    });

    expect(header(seen[0], CSRF)).toBe('caller-supplied');
  });

  test('LDMClient /discover-links POST carries the header (the 403 regression)', async () => {
    const client = new OSLCClient('user', 'pass');
    const ldm = new LDMClient(client, 'https://server.example.com/ldx');
    // Turtle response so the RDF branch is the one exercised.
    const seen = captureRequests(client, () => ({
      status: 200,
      headers: { 'content-type': 'text/turtle' },
      data: '',
    }));

    await ldm.getIncomingLinks(['https://server.example.com/rm/resource/1']);

    expect(seen.length).toBeGreaterThan(0);
    const discoverPosts = seen.filter((c) => String(c.url).endsWith('/discover-links'));
    expect(discoverPosts.length).toBeGreaterThan(0);
    for (const config of discoverPosts) {
      expect(header(config, CSRF)).toBe('1');
    }
  });

  test('LDMClient /incoming-links POST carries the header', async () => {
    const client = new OSLCClient('user', 'pass');
    // A base containing /lqe selects the incoming-links branch.
    const ldm = new LDMClient(client, 'https://server.example.com/lqe');
    const seen = captureRequests(client, () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { queryResults: [] },
    }));

    await ldm.getIncomingLinks(['https://server.example.com/rm/resource/1']);

    const posts = seen.filter((c) => String(c.url).endsWith('/incoming-links'));
    expect(posts.length).toBeGreaterThan(0);
    for (const config of posts) {
      expect(header(config, CSRF)).toBe('1');
    }
  });
});
