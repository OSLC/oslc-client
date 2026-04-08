/**
 * Unit tests for LDMClient composition pattern.
 * LDMClient receives an OSLCClient instance instead of extending it.
 */
import { jest } from '@jest/globals';

// Mock rdflib to avoid heavy dependency in unit tests
jest.unstable_mockModule('rdflib', () => {
  const mockStore = {
    statementsMatching: jest.fn(() => []),
  };
  return {
    graph: jest.fn(() => mockStore),
    parse: jest.fn(),
    default: { graph: jest.fn(() => mockStore), parse: jest.fn() },
  };
});

const { default: LDMClient } = await import('../LDMClient.js');

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
