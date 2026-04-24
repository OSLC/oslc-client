/*
 * Integration test — LDMClient against an oslc-service server's
 * /discover-links endpoint.
 *
 * Verifies that the existing LDMClient legacy-LDM code path (which
 * POSTs Turtle to `{baseURL}/discover-links`) works unchanged against
 * the new oslc-service LDM handler added in oslc-service commit
 * d9a0b51 / jena-storage-service commit 7cfcc9a. No client-side code
 * changes required.
 *
 * Enable:
 *   RUN_OSLC_SERVICE_LDM_TESTS=true npm test
 *
 * Prereqs:
 *   - bmm-server running at http://localhost:3005 (or whatever URL is
 *     provided via OSLC_SERVICE_BASE_URL) with jena-storage-service
 *     backing it
 *   - the EU-Rent example populated (run testing/populate-eurent.sh)
 *   - OSLC_SERVICE_TARGET_URI set to a URI that is actually referenced
 *     by other resources in the graph (e.g., a Vision URI — other
 *     Strategies point at it via channelsEffortsToward, so we expect
 *     at least one incoming link)
 */

import OSLCClient from '../OSLCClient.js';
import LDMClient from '../LDMClient.js';

const RUN = process.env.RUN_OSLC_SERVICE_LDM_TESTS === 'true';
const describeIf = RUN ? describe : describe.skip;

describeIf('LDMClient against oslc-service /discover-links', () => {
  test('returns incoming links for a known target resource', async () => {
    const baseUrl = process.env.OSLC_SERVICE_BASE_URL || 'http://localhost:3005';
    const targetUrl = process.env.OSLC_SERVICE_TARGET_URI;

    if (!targetUrl) {
      throw new Error(
        'OSLC_SERVICE_TARGET_URI must be set to a populated resource URI. ' +
        'Example: run testing/populate-eurent.sh, then curl the Vision URI from ' +
        'the query endpoint: ' +
        'curl "http://localhost:3005/oslc/eu-rent/query?oslc.where=rdf:type=%3Chttp://www.omg.org/spec/BMM%23Vision%3E" ' +
        '-H "Accept: text/turtle"'
      );
    }

    const oslcClient = new OSLCClient();
    const ldm = new LDMClient(oslcClient, baseUrl);

    const triples = await ldm.getIncomingLinks([targetUrl]);

    expect(Array.isArray(triples)).toBe(true);
    // A Vision in the populated EU-Rent example is pointed at by
    // multiple Strategies (channelsEffortsToward). A Goal is pointed at
    // by Strategies, Tactics (enablesEnd), and is Vision.madeOperativeBy.
    // Any populated target should have at least one incoming link.
    expect(triples.length).toBeGreaterThan(0);

    for (const t of triples) {
      expect(t).toHaveProperty('sourceURL');
      expect(t).toHaveProperty('linkType');
      expect(t).toHaveProperty('targetURL');
      expect(t.targetURL).toBe(targetUrl);
      // Infrastructure predicates should be filtered out by the server
      expect(t.linkType).not.toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
      expect(t.linkType).not.toBe('http://www.w3.org/ns/ldp#contains');
      expect(t.linkType).not.toBe('http://open-services.net/ns/core#serviceProvider');
      expect(t.linkType).not.toBe('http://open-services.net/ns/core#instanceShape');
    }
  });

  test('predicate filter restricts result set', async () => {
    const baseUrl = process.env.OSLC_SERVICE_BASE_URL || 'http://localhost:3005';
    const targetUrl = process.env.OSLC_SERVICE_TARGET_URI;
    const filterPredicate = process.env.OSLC_SERVICE_FILTER_PREDICATE;

    if (!targetUrl || !filterPredicate) {
      // Skip silently if the env vars aren't set — the primary test
      // above is the minimum acceptance bar.
      return;
    }

    const oslcClient = new OSLCClient();
    const ldm = new LDMClient(oslcClient, baseUrl);

    const triples = await ldm.getIncomingLinks([targetUrl], [filterPredicate]);

    expect(Array.isArray(triples)).toBe(true);
    for (const t of triples) {
      expect(t.linkType).toBe(filterPredicate);
      expect(t.targetURL).toBe(targetUrl);
    }
  });
});
