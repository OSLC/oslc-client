import LDMClient from '../LDMClient.js';

const RUN = process.env.RUN_LQE_INTEGRATION_TESTS === 'true';

const describeIf = RUN ? describe : describe.skip;

describeIf('LDMClient LQE SPARQL integration', () => {
  test('gets and inverts incoming links for work item 892', async () => {
    const baseUrl = process.env.LQE_BASE_URL || 'https://trs-filter.smartfacts.com/lqe';
    const workItemUrl = process.env.LQE_WORK_ITEM_URL || 'https://trs-filter.smartfacts.com/ccm/resource/itemName/com.ibm.team.workitem.WorkItem/892';

    const configurationContext = process.env.CONFIGURATION_CONTEXT || null;

    const linkTypes = (process.env.LQE_LINK_TYPES || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const user = process.env.LQE_USER_ID || 'ADMIN';
    const password = process.env.LQE_PASSWORD || 'ADMIN';
    const authorization = process.env.LQE_AUTHORIZATION || null;

    const baseHost = new URL(baseUrl).hostname;
    const allowSelfSigned = process.env.LQE_INSECURE_TLS === 'true' || baseHost === 'ibm-elm';

    const client = new LDMClient(baseUrl, { user, password, authorization, insecureTLS: allowSelfSigned });

    const bearer = process.env.LQE_BEARER_TOKEN;

    if (bearer) {
      client.client.defaults.headers.common['Authorization'] = bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`;
    }

    const triples = await client.getIncomingLinks([workItemUrl], linkTypes, configurationContext);

    expect(Array.isArray(triples)).toBe(true);

    if (triples.length > 0) {
      expect(triples[0]).toHaveProperty('sourceURL');
      expect(triples[0]).toHaveProperty('linkType');
      expect(triples[0]).toHaveProperty('targetURL');
      expect(triples[0].targetURL).toBe(workItemUrl);
    }

    const inverted = client.invert(triples);
    expect(Array.isArray(inverted)).toBe(true);
    expect(inverted.length).toBe(triples.length);

    if (inverted.length > 0) {
      expect(inverted[0]).toHaveProperty('targetURL');
      expect(inverted[0]).toHaveProperty('inverseLinkType');
      expect(inverted[0]).toHaveProperty('sourceURL');
      expect(inverted[0].targetURL).toBe(workItemUrl);
    }
  }, 60000);
});
