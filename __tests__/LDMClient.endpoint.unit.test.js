/**
 * Endpoint selection for incoming-links queries.
 *
 * Per the LQE/LDX Incoming Links REST API (servlet mapping /incoming-links,
 * since ELM 7.1.0), the same REST API is served by BOTH applications:
 *   https://{server}/lqe/incoming-links
 *   https://{server}/ldx/incoming-links
 * and the documented examples address a dataset: /incoming-links/default.
 * A 404 from this API means "dataset not found" (or the API is absent on a
 * pre-7.1.0 server), not that the base URL is wrong.
 *
 * /discover-links is a different thing: the OSLC LDM specification endpoint,
 * for servers that implement it.
 *
 * Regression: endpoint choice was `LDMServerBaseURL.includes('/lqe')`, which
 * decided by how the URL was spelled. An /ldx base was therefore sent to
 * /discover-links, which LDX does not serve, and an /lqe base was sent to a
 * dataset-less /incoming-links. Both 404'd, so no setting could work.
 */
import { jest } from '@jest/globals';

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

const { default: LDMClient } = await import('../LDMClient.js');

const TARGET = 'https://server.example.com/rm/resources/456';

function notFound(url) {
  const error = new Error('Request failed with status code 404');
  error.response = { status: 404, headers: {}, config: { url }, data: 'Dataset not found' };
  return error;
}

/**
 * Fake OSLCClient whose post() resolves only for URLs in `serves`;
 * everything else 404s. Records the URLs attempted, in order.
 */
function makeClient(serves, payload = { numberOfResults: 0, queryResults: [] }) {
  const attempted = [];
  return {
    attempted,
    oslc: {
      userid: 'u',
      password: 'p',
      configuration_context: null,
      client: {
        defaults: { headers: { common: {} } },
        get: jest.fn(),
        post: jest.fn(async (url) => {
          attempted.push(url);
          if (serves.some((s) => url.endsWith(s))) {
            return { status: 200, headers: { 'content-type': 'application/json' }, data: payload };
          }
          throw notFound(url);
        }),
      },
    },
  };
}

describe('incoming-links endpoint selection', () => {
  test('LDX base uses the incoming-links REST API, not discover-links', async () => {
    const { oslc, attempted } = makeClient(['/incoming-links']);
    const ldm = new LDMClient(oslc, 'https://server.example.com/ldx');

    await ldm.getIncomingLinks([TARGET]);

    expect(attempted.some((u) => u.includes('/incoming-links'))).toBe(true);
    expect(attempted.every((u) => !u.includes('/discover-links'))).toBe(true);
  });

  test('LQE base uses the incoming-links REST API', async () => {
    const { oslc, attempted } = makeClient(['/incoming-links']);
    const ldm = new LDMClient(oslc, 'https://server.example.com/lqe');

    await ldm.getIncomingLinks([TARGET]);

    expect(attempted.some((u) => u.includes('/incoming-links'))).toBe(true);
  });

  test('falls back to the default dataset when the bare path 404s', async () => {
    // Only the dataset-qualified URL is served.
    const { oslc, attempted } = makeClient(['/incoming-links/default']);
    const ldm = new LDMClient(oslc, 'https://server.example.com/ldx');

    const links = await ldm.getIncomingLinks([TARGET]);

    expect(attempted).toContain('https://server.example.com/ldx/incoming-links');
    expect(attempted).toContain('https://server.example.com/ldx/incoming-links/default');
    expect(Array.isArray(links)).toBe(true);
  });

  test('falls back to OSLC LDM discover-links when no incoming-links variant exists', async () => {
    // Neutral base: no hint, so incoming-links is tried first and must fall through.
    const { oslc, attempted } = makeClient(['/discover-links'], '');
    const ldm = new LDMClient(oslc, 'https://server.example.com/linkindex');

    await ldm.getIncomingLinks([TARGET]);

    expect(attempted.some((u) => u.endsWith('/incoming-links'))).toBe(true);
    expect(attempted.some((u) => u.includes('/discover-links'))).toBe(true);
  });

  test('an /ldm base tries the OSLC LDM endpoint first (ordering hint only)', async () => {
    const { oslc, attempted } = makeClient(['/discover-links'], '');
    const ldm = new LDMClient(oslc, 'https://server.example.com/ldm');

    await ldm.getIncomingLinks([TARGET]);

    expect(attempted[0]).toBe('https://server.example.com/ldm/discover-links');
  });

  test('remembers the endpoint that worked instead of re-probing every query', async () => {
    const { oslc, attempted } = makeClient(['/incoming-links/default']);
    const ldm = new LDMClient(oslc, 'https://server.example.com/ldx');

    await ldm.getIncomingLinks([TARGET]);
    const afterFirst = attempted.length;
    expect(afterFirst).toBe(2); // bare path 404s, then the dataset answers

    await ldm.getIncomingLinks([TARGET]);

    // Second query goes straight to the known-good endpoint.
    expect(attempted.length).toBe(afterFirst + 1);
    expect(attempted[attempted.length - 1]).toBe(
      'https://server.example.com/ldx/incoming-links/default'
    );
  });

  test('sends the documented parameters', async () => {
    const { oslc } = makeClient(['/incoming-links']);
    const ldm = new LDMClient(oslc, 'https://server.example.com/ldx');

    await ldm.getIncomingLinks([TARGET], ['http://open-services.net/ns/cm#trackedBy'], 'https://server/gc/configuration/123');

    const [, body, config] = oslc.client.post.mock.calls[0];
    const params = new URLSearchParams(body);
    expect(params.getAll('targetUrl')).toEqual([TARGET]);
    expect(params.getAll('linkType')).toEqual(['http://open-services.net/ns/cm#trackedBy']);
    expect(params.get('oslc_config.context')).toBe('https://server/gc/configuration/123');
    expect(config.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(config.headers['Accept']).toBe('application/json');
  });

  test('stops after the first endpoint that answers', async () => {
    const { oslc, attempted } = makeClient(['/incoming-links']);
    const ldm = new LDMClient(oslc, 'https://server.example.com/ldx');

    await ldm.getIncomingLinks([TARGET]);

    expect(attempted).toEqual(['https://server.example.com/ldx/incoming-links']);
  });
});
