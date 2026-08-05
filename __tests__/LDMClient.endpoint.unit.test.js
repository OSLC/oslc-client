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
    // An /ldx base tries incoming-links first, which 404s here, then falls
    // through to discover-links — two requests on the first query, one after.
    const { oslc, attempted } = makeClient(['/discover-links'], '');
    const ldm = new LDMClient(oslc, 'https://server.example.com/ldx');

    await ldm.getIncomingLinks([TARGET]);
    const afterFirst = attempted.length;
    expect(afterFirst).toBeGreaterThan(1);

    await ldm.getIncomingLinks([TARGET]);

    // Second query goes straight to the known-good endpoint.
    expect(attempted.length).toBe(afterFirst + 1);
    expect(attempted[attempted.length - 1]).toBe(
      'https://server.example.com/ldx/discover-links'
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

  test('does not try a dataset-qualified path — the servlet mapping is exact', async () => {
    // GET /lqe/incoming-links returns 500 (servlet mapped, threw on GET) while
    // GET /lqe/incoming-links/default returns 404 (not routed). The API doc's
    // Implementation Reference says "Servlet Mapping: /incoming-links", which the
    // server confirms; its curl examples showing /default contradict it. A
    // dataset segment, where a deployment needs one, belongs in configuration.
    const { oslc, attempted } = makeClient(['/discover-links'], '');
    const ldm = new LDMClient(oslc, 'https://server.example.com/ldx');

    await ldm.getIncomingLinks([TARGET]);

    expect(attempted.every((u) => !u.includes('/incoming-links/'))).toBe(true);
  });

  test('reports the most relevant endpoint failure, not the last one tried', async () => {
    // Candidates are ordered most-likely-first, so the FIRST failure is the
    // informative one. Reporting the last discarded LQE's actual explanation and
    // left only the OSLC LDM endpoint's generic 404.
    const attempted = [];
    const oslc = {
      userid: 'u', password: 'p', configuration_context: null,
      client: {
        defaults: { headers: { common: {} } },
        get: jest.fn(),
        post: jest.fn(async (url) => {
          attempted.push(url);
          const error = new Error('Request failed with status code 404');
          error.response = {
            status: 404,
            headers: {},
            config: { url },
            data: url.includes('/incoming-links')
              ? 'Configuration https://server/cdcm/.../configuration/abc does not exist in the index or is not a configuration.'
              : 'Not Found',
          };
          throw error;
        }),
      },
    };
    const ldm = new LDMClient(oslc, 'https://server.example.com/lqe');

    await expect(ldm.getIncomingLinks([TARGET])).rejects.toThrow(/incoming-links/);
    await expect(ldm.getIncomingLinks([TARGET])).rejects.toThrow(/does not exist in the index/);
  });

  test('surfaces a plain-text error body instead of the bare axios message', async () => {
    // The wrapper read response.data.error, so a text/plain body fell through to
    // "Request failed with status code 404" and the server's explanation was lost.
    const oslc = {
      userid: 'u', password: 'p', configuration_context: null,
      client: {
        defaults: { headers: { common: {} } },
        get: jest.fn(),
        post: jest.fn(async (url) => {
          const error = new Error('Request failed with status code 404');
          error.response = { status: 404, headers: {}, config: { url }, data: 'Dataset not found' };
          throw error;
        }),
      },
    };
    const ldm = new LDMClient(oslc, 'https://server.example.com/lqe');

    await expect(ldm.getIncomingLinks([TARGET])).rejects.toThrow(/Dataset not found/);
  });

  test('stops after the first endpoint that answers', async () => {
    const { oslc, attempted } = makeClient(['/incoming-links']);
    const ldm = new LDMClient(oslc, 'https://server.example.com/ldx');

    await ldm.getIncomingLinks([TARGET]);

    expect(attempted).toEqual(['https://server.example.com/ldx/incoming-links']);
  });
});
