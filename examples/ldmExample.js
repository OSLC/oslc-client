import LDMClient from '../LDMClient.js';

const LQE_BASE_URL = process.env.LQE_BASE_URL || 'https://trs-filter.smartfacts.com/lqe';
const TARGET_URL = process.env.TARGET_URL || 'https://trs-filter.smartfacts.com/ccm/resource/itemName/com.ibm.team.workitem.WorkItem/892';
const CONFIGURATION_CONTEXT = process.env.CONFIGURATION_CONTEXT || null;

const USER_ID = process.env.LQE_USER_ID || 'ADMIN';
const PASSWORD = process.env.LQE_PASSWORD || 'ADMIN';
const BEARER_TOKEN = process.env.LQE_BEARER_TOKEN || null;
const AUTHORIZATION = process.env.LQE_AUTHORIZATION || null;

const LINK_TYPES = (process.env.LQE_LINK_TYPES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const DEBUG_LQE = process.env.DEBUG_LQE || 'true';
const INSECURE_TLS = process.env.LQE_INSECURE_TLS === 'true';
process.env.DEBUG_LQE = 'true';

function printTriples(title, triples) {
  console.log(`\n${title} (${triples.length})`);
  for (const t of triples) {
    console.log(`- ${t.sourceURL}  ${t.linkType}  ${t.targetURL}`);
  }
}

function printInverted(title, inverted) {
  console.log(`\n${title} (${inverted.length})`);
  for (const t of inverted) {
    console.log(`- ${t.targetURL}  ${t.inverseLinkType}  ${t.sourceURL}`);
  }
}

const client = new LDMClient(LQE_BASE_URL, { user: USER_ID, password: PASSWORD, authorization: AUTHORIZATION, insecureTLS: INSECURE_TLS });

if (BEARER_TOKEN) {
  client.client.defaults.headers.common['Authorization'] = BEARER_TOKEN.startsWith('Bearer ')
    ? BEARER_TOKEN
    : `Bearer ${BEARER_TOKEN}`;
}

if (DEBUG_LQE === 'true') {
  console.log(`LQE_BASE_URL=${LQE_BASE_URL}`);
  console.log(`TARGET_URL=${TARGET_URL}`);
  if (CONFIGURATION_CONTEXT) console.log(`CONFIGURATION_CONTEXT=${CONFIGURATION_CONTEXT}`);
  if (LINK_TYPES.length) console.log(`LQE_LINK_TYPES=${LINK_TYPES.join(',')}`);
}

try {
  const triples = await client.getIncomingLinks([TARGET_URL], LINK_TYPES, CONFIGURATION_CONTEXT);
  printTriples('Incoming links', triples);

  const inverted = client.invert(triples);
  printInverted('Inverted incoming links', inverted);
} catch (err) {
  console.error(`Failed to get incoming links: ${err?.response?.status || ''} ${err?.message || err}`);
  if (DEBUG_LQE === 'true' && err?.response?.data) {
    console.error(err.response.data);
  }
  process.exitCode = 1;
}
