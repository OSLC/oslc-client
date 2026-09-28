/**
 * Unit tests for LDMClient composition pattern.
 * LDMClient receives an OSLCClient instance instead of extending it.
 */
import { jest } from '@jest/globals';

// Mock rdflib to avoid heavy dependency in unit tests
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

const { default: LDMClient, INVERSE_LINK_TYPES } = await import('../LDMClient.js');
const { default: OSLCClient } = await import('../OSLCClient.js');

/**
 * Build a fake OSLCClient-like object with the properties LDMClient needs.
 */
function makeFakeOslcClient(overrides = {}) {
  return {
    userid: 'testuser',
    password: 'testpass',
    configuration_context: 'https://server/gc/configuration/1',
    client: {
      post: jest.fn().mockResolvedValue({ data: { queryResults: [] }, headers: {} }),
      get: jest.fn().mockResolvedValue({ data: '', headers: {} }),
      defaults: { headers: { common: {} } },
    },
    ...overrides,
  };
}

describe('LDMClient composition pattern', () => {
  describe('constructor', () => {
    it('accepts an OSLCClient-like object and ldmBaseUrl', () => {
      const oslcClient = makeFakeOslcClient();
      const ldm = new LDMClient(oslcClient, 'https://server/ldm');
      expect(ldm).toBeDefined();
      expect(ldm.oslcClient).toBe(oslcClient);
    });

    it('throws if ldmBaseUrl is missing', () => {
      const oslcClient = makeFakeOslcClient();
      expect(() => new LDMClient(oslcClient)).toThrow('LDMServerBaseURL is required');
      expect(() => new LDMClient(oslcClient, '')).toThrow('LDMServerBaseURL is required');
      expect(() => new LDMClient(oslcClient, null)).toThrow('LDMServerBaseURL is required');
    });

    it('normalizes trailing slash from ldmBaseUrl', () => {
      const oslcClient = makeFakeOslcClient();
      const ldm = new LDMClient(oslcClient, 'https://server/ldm/');
      expect(ldm.LDMServerBaseURL).toBe('https://server/ldm');
    });
  });

  describe('uses OSLCClient axios instance', () => {
    it('uses oslcClient.client for LQE requests', async () => {
      const oslcClient = makeFakeOslcClient();
      oslcClient.client.post.mockResolvedValue({
        data: { queryResults: [] },
        headers: { 'content-type': 'application/json' },
      });

      const ldm = new LDMClient(oslcClient, 'https://server/lqe');
      await ldm.getIncomingLinks(['https://server/rm/resources/1']);

      expect(oslcClient.client.post).toHaveBeenCalled();
      const [url] = oslcClient.client.post.mock.calls[0];
      expect(url).toBe('https://server/lqe/incoming-links');
    });

    it('uses oslcClient.client for LDM requests', async () => {
      const oslcClient = makeFakeOslcClient();
      oslcClient.client.post.mockResolvedValue({
        data: '@prefix : <http://example.org/> .',
        headers: { 'content-type': 'text/turtle' },
      });

      const ldm = new LDMClient(oslcClient, 'https://server/ldm');
      await ldm.getIncomingLinks(['https://server/rm/resources/1']);

      expect(oslcClient.client.post).toHaveBeenCalled();
      const [url] = oslcClient.client.post.mock.calls[0];
      expect(url).toBe('https://server/ldm/discover-links');
    });
  });

  describe('getIncomingLinks', () => {
    it('calls the LQE endpoint when base URL contains /lqe', async () => {
      const oslcClient = makeFakeOslcClient();
      oslcClient.client.post.mockResolvedValue({
        data: { queryResults: [{ sourceUrl: 'https://s', linkType: 'https://lt', targetUrl: 'https://t' }] },
        headers: { 'content-type': 'application/json' },
      });

      const ldm = new LDMClient(oslcClient, 'https://server/lqe');
      const results = await ldm.getIncomingLinks(['https://server/rm/resources/1']);

      expect(results).toEqual([{ sourceURL: 'https://s', linkType: 'https://lt', targetURL: 'https://t' }]);
    });

    it('passes configuration_context from oslcClient when not overridden', async () => {
      const oslcClient = makeFakeOslcClient({ configuration_context: 'https://server/gc/config/42' });
      oslcClient.client.post.mockResolvedValue({
        data: { queryResults: [] },
        headers: { 'content-type': 'application/json' },
      });

      const ldm = new LDMClient(oslcClient, 'https://server/lqe');
      await ldm.getIncomingLinks(['https://server/rm/resources/1']);

      const [, body] = oslcClient.client.post.mock.calls[0];
      expect(body).toContain('oslc_config.context=https');
    });

    it('throws on empty targetResourceURLs', async () => {
      const ldm = new LDMClient(makeFakeOslcClient(), 'https://server/lqe');
      await expect(ldm.getIncomingLinks([])).rejects.toThrow('targetResourceURLs must be a non-empty array');
    });
  });

  describe('invert', () => {
    it('maps link types to their inverses', () => {
      const ldm = new LDMClient(makeFakeOslcClient(), 'https://server/lqe');
      const result = ldm.invert([{
        sourceURL: 'https://s',
        linkType: 'http://open-services.net/ns/rm#elaborates',
        targetURL: 'https://t',
      }]);

      expect(result).toEqual([{
        targetURL: 'https://t',
        inverseLinkType: 'http://open-services.net/ns/rm#elaboratedBy',
        sourceURL: 'https://s',
      }]);
    });

    it('returns original link type when no inverse mapping exists', () => {
      const ldm = new LDMClient(makeFakeOslcClient(), 'https://server/lqe');
      const result = ldm.invert([{
        sourceURL: 'https://s',
        linkType: 'http://example.org/unknownLink',
        targetURL: 'https://t',
      }]);

      expect(result[0].inverseLinkType).toBe('http://example.org/unknownLink');
    });

    it('handles symmetric link types', () => {
      const ldm = new LDMClient(makeFakeOslcClient(), 'https://server/lqe');
      const result = ldm.invert([{
        sourceURL: 'https://s',
        linkType: 'http://open-services.net/ns/core#related',
        targetURL: 'https://t',
      }]);

      expect(result[0].inverseLinkType).toBe('http://open-services.net/ns/core#related');
    });
  });
});

describe('OSLCClient.getIncomingLinks', () => {
  test('returns empty array when no ldmBaseUrl configured', async () => {
    const client = new OSLCClient('user', 'pass');
    const result = await client.getIncomingLinks(['https://server/rm/r1'], []);
    expect(result).toEqual([]);
  });

  test('delegates to LDMClient when ldmBaseUrl is configured', async () => {
    const client = new OSLCClient('user', 'pass', null, {
      ldmBaseUrl: 'https://server/lqe'
    });
    await client._ensureInitialized();

    // Mock the axios post to return LQE results
    client.client.post = jest.fn().mockResolvedValue({
      data: {
        queryResults: [{
          sourceUrl: 'https://server/ccm/wi/1',
          linkType: 'http://open-services.net/ns/cm#implementsRequirement',
          targetUrl: 'https://server/rm/req/1'
        }]
      },
      headers: { 'content-type': 'application/json' },
    });

    const result = await client.getIncomingLinks(['https://server/rm/req/1'], []);

    // Should return already-inverted results
    expect(result).toEqual([{
      targetURL: 'https://server/rm/req/1',
      inverseLinkType: 'http://open-services.net/ns/rm#implementedBy',
      sourceURL: 'https://server/ccm/wi/1'
    }]);
  });
});

describe('INVERSE_LINK_TYPES coverage for CM -> AM links', () => {
  const REL_ARCH = 'http://open-services.net/ns/cm#relatedArchitectureElement';

  /**
   * This map doubles as the set of link types queried: discoverIncomingLinks sends
   * its keys as `linkType`, and LQE answers only "what points here via this
   * predicate". A predicate missing from it is never asked about, and its incoming
   * links read as an empty answer indistinguishable from "nothing links here".
   *
   * Measured 2026-09-28: two EWM change requests pointed at a BMM Objective and LQE
   * returned both the moment it was asked with this predicate. The client had not
   * been asking, because relatedArchitectureElement -- the only link type EWM offers
   * to an architecture resource -- was missing.
   */
  it('includes relatedArchitectureElement, so CM -> AM links get queried', () => {
    expect([...INVERSE_LINK_TYPES.keys()]).toContain(REL_ARCH);
  });

  it('maps it to itself, since OSLC declares no inverse term for it', () => {
    expect(INVERSE_LINK_TYPES.get(REL_ARCH)).toBe(REL_ARCH);
  });

  /**
   * An inverse that is not itself a key is never queried, so incoming links in that
   * direction are invisible -- the same blind spot relatedArchitectureElement had.
   * Two such orphans exist today and are recorded rather than fixed silently, since
   * adding them changes what every client asks LQE for. This guards against a third
   * appearing unnoticed.
   */
  it('has only the two known orphan inverses, so no new blind spot creeps in', () => {
    const keys = new Set(INVERSE_LINK_TYPES.keys());
    const orphans = [...new Set([...INVERSE_LINK_TYPES.values()])].filter((v) => !keys.has(v)).sort();
    expect(orphans).toEqual([
      'http://open-services.net/ns/qm#relatedChangeRequest',
      'http://open-services.net/ns/rm#validatedBy',
    ]);
  });
});
