import * as $rdf from 'rdflib';
import OSLCClient from './OSLCClient.js';

const DEFAULT_ACCEPT = 'text/turtle, application/rdf+xml;q=0.9, application/ld+json;q=0.8, application/json;q=0.7';

const INVERSE_LINK_TYPES = new Map([
  ['http://open-services.net/ns/core#related', 'http://open-services.net/ns/core#related'],
  ['http://open-services.net/ns/rm#constraints', 'http://open-services.net/ns/rm#constrainedBy'],
  ['http://open-services.net/ns/rm#constrainedBy', 'http://open-services.net/ns/rm#constraints'],
  ['http://open-services.net/ns/rm#decomposes', 'http://open-services.net/ns/rm#decomposedBy'],
  ['http://open-services.net/ns/rm#decomposedBy', 'http://open-services.net/ns/rm#decomposes'],
  ['http://open-services.net/ns/rm#elaborates', 'http://open-services.net/ns/rm#elaboratedBy'],
  ['http://open-services.net/ns/rm#elaboratedBy', 'http://open-services.net/ns/rm#elaborates'],
  ['http://open-services.net/ns/rm#satisfies', 'http://open-services.net/ns/rm#satisfiedBy'],
  ['http://open-services.net/ns/rm#satisfiedBy', 'http://open-services.net/ns/rm#satisfies'],
  ['http://open-services.net/ns/rm#specifies', 'http://open-services.net/ns/rm#specifiedBy'],
  ['http://open-services.net/ns/rm#specifiedBy', 'http://open-services.net/ns/rm#specifies'],
  ['http://open-services.net/ns/qm#validatesRequirement', 'http://open-services.net/ns/rm#validatedBy'],
  ['http://open-services.net/ns/qm#validatesRequirementCollection', 'http://open-services.net/ns/rm#validatedBy'],

  ['http://open-services.net/ns/cm#implementsRequirement', 'http://open-services.net/ns/rm#implementedBy'],
  ['http://open-services.net/ns/cm#tracksRequirement', 'http://open-services.net/ns/rm#trackedBy'],
  ['http://open-services.net/ns/cm#affectsRequirement', 'http://open-services.net/ns/rm#affectedBy'],
  ['http://open-services.net/ns/rm#implementedBy', 'http://open-services.net/ns/cm#implementsRequirement'],
  ['http://open-services.net/ns/rm#trackedBy', 'http://open-services.net/ns/cm#tracksRequirement'],
  ['http://open-services.net/ns/rm#affectedBy', 'http://open-services.net/ns/cm#affectsRequirement'],

  ['http://open-services.net/ns/cm#testedByTestCase', 'http://open-services.net/ns/qm#testsChangeRequest'],
  ['http://open-services.net/ns/qm#testsChangeRequest', 'http://open-services.net/ns/cm#testedByTestCase'],
  ['http://open-services.net/ns/cm#relatedTestScript', 'http://open-services.net/ns/qm#relatedChangeRequest'],
  ['http://open-services.net/ns/cm#relatedTestCase', 'http://open-services.net/ns/qm#relatedChangeRequest'],
  ['http://open-services.net/ns/cm#relatedTestPlan', 'http://open-services.net/ns/qm#relatedChangeRequest'],
  ['http://open-services.net/ns/cm#relatedTestExecutionRecord', 'http://open-services.net/ns/qm#relatedChangeRequest'],
  ['http://open-services.net/ns/cm#blocksTestExecutionRecord', 'http://open-services.net/ns/qm#blockedByChangeRequest'],
  ['http://open-services.net/ns/qm#blockedByChangeRequest', 'http://open-services.net/ns/cm#blocksTestExecutionRecord'],
  ['http://open-services.net/ns/cm#affectsTestResult', 'http://open-services.net/ns/qm#affectedByChangeRequest'],
  ['http://open-services.net/ns/qm#affectedByChangeRequest', 'http://open-services.net/ns/cm#affectsTestResult'],

  ['http://open-services.net/ns/cm#affectedByDefect', 'http://open-services.net/ns/cm#affectsPlanItem'],
  ['http://open-services.net/ns/cm#affectsPlanItem', 'http://open-services.net/ns/cm#affectedByDefect'],

  ['http://jazz.net/ns/rm/navigation#parent', 'http://jazz.net/ns/rm/navigation#children'],
  ['http://jazz.net/ns/rm/navigation#children', 'http://jazz.net/ns/rm/navigation#parent']
]);

function normalizeBaseUrl(url) {
  if (!url) {
    throw new Error('LDMServerBaseURL is required');
  }
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function asUrlString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function parseRdfTriples({ data, contentType, baseIRI }) {
  const store = $rdf.graph();
  const ct = contentType?.split(';')[0]?.trim() || 'text/turtle';
  $rdf.parse(data, store, baseIRI, ct);
  return store.statementsMatching(null, null, null).map(st => ({
    sourceURL: st.subject.value,
    linkType: st.predicate.value,
    targetURL: st.object.value
  }));
}

/**
 * LDMClient extends OSLCClient to provide Link Discovery Management (LDM) functionality.
 * It inherits authentication handling from OSLCClient and adds methods for discovering
 * incoming links to OSLC resources.
 */
export default class LDMClient extends OSLCClient {
  /**
   * Create an LDMClient instance.
   * @param {string} user - Username for authentication
   * @param {string} password - Password for authentication
   * @param {string|null} configurationContext - GCM configuration context URL (optional)
   * @param {string} ldmServerBaseUrl - Base URL of the LDM server (e.g., https://server/ldm)
   */
  constructor(user, password, configurationContext, ldmServerBaseUrl) {
    // Call OSLCClient constructor to set up authentication and axios client
    super(user, password, configurationContext);

    this.LDMServerBaseURL = normalizeBaseUrl(ldmServerBaseUrl);
    this._warnedMissingInverseLinkTypes = new Set();
  }

  /**
   * Get incoming links to one or more target resources.
   * @param {string[]} targetResourceURLs - Array of resource URLs to find incoming links for
   * @param {string[]} linkTypes - Optional array of link type URIs to filter by
   * @param {string|null} configurationContext - Optional configuration context (overrides constructor value)
   * @returns {Promise<Array<{sourceURL: string, linkType: string, targetURL: string}>>}
   */
  async getIncomingLinks(targetResourceURLs, linkTypes = [], configurationContext = null) {
    if (!Array.isArray(targetResourceURLs) || targetResourceURLs.length === 0) {
      throw new Error('targetResourceURLs must be a non-empty array');
    }
    if (!Array.isArray(linkTypes)) {
      throw new Error('linkTypes must be an array');
    }

    // Use provided configurationContext or fall back to the one set in constructor
    const effectiveConfigContext = configurationContext || this.configuration_context;

    const isLqe = this.LDMServerBaseURL.includes('/lqe');
    if (isLqe) {
      return this.#getIncomingLinksViaLqe(targetResourceURLs, linkTypes, effectiveConfigContext);
    }
    return this.#getIncomingLinksViaLdm(targetResourceURLs, linkTypes, effectiveConfigContext);
  }

  /**
   * Invert a list of triples, swapping source and target and mapping to inverse link types.
   * @param {Array<{sourceURL: string, linkType: string, targetURL: string}>} triples
   * @returns {Array<{targetURL: string, inverseLinkType: string, sourceURL: string}>}
   */
  invert(triples) {
    if (!Array.isArray(triples)) {
      throw new Error('triples must be an array');
    }

    const debugLqe = typeof process !== 'undefined' && process?.env?.DEBUG_LQE === 'true';

    return triples.map(t => {
      const sourceURL = Array.isArray(t) ? t[0] : t?.sourceURL;
      const linkType = Array.isArray(t) ? t[1] : t?.linkType;
      const targetURL = Array.isArray(t) ? t[2] : t?.targetURL;

      const source = asUrlString(sourceURL, 'sourceURL');
      const predicate = asUrlString(linkType, 'linkType');
      const target = asUrlString(targetURL, 'targetURL');

      let inverseLinkType = INVERSE_LINK_TYPES.get(predicate);
      if (!inverseLinkType) {
        const matches = [];
        for (const [k, v] of INVERSE_LINK_TYPES.entries()) {
          if (v === predicate) {
            matches.push(k);
          }
        }

        if (matches.length === 1) {
          inverseLinkType = matches[0];
        } else if (matches.length > 1) {
          inverseLinkType = matches[0];
          if (debugLqe && !this._warnedMissingInverseLinkTypes.has(predicate)) {
            this._warnedMissingInverseLinkTypes.add(predicate);
            console.warn(`[LDMClient] Multiple inverse link type mappings found for predicate: ${predicate}. Using: ${inverseLinkType}`);
          }
        }
      }

      if (!inverseLinkType) {
        if (debugLqe && !this._warnedMissingInverseLinkTypes.has(predicate)) {
          this._warnedMissingInverseLinkTypes.add(predicate);
          console.warn(`[LDMClient] No inverse link type mapping found for predicate: ${predicate}`);
        }
      }
      return {
        targetURL: target,
        inverseLinkType: inverseLinkType || predicate,
        sourceURL: source
      };
    });
  }

  async #getIncomingLinksViaLdm(targetResourceURLs, linkTypes, configurationContext) {
    const url = `${this.LDMServerBaseURL}/discover-links`;

    const headers = {
      'Accept': DEFAULT_ACCEPT
    };
    if (configurationContext) {
      headers['Configuration-Context'] = asUrlString(configurationContext, 'configurationContext');
    }

    const postRdfRequest = async () => {
      const oslcLdmNamespace = 'http://open-services.net/ns/ldm#';
      const resourceList = targetResourceURLs
        .map(u => `<${asUrlString(u, 'targetResourceURL')}>`)
        .join(', ');

      const predicateList = (Array.isArray(linkTypes) && linkTypes.length > 0)
        ? linkTypes.map(u => `<${asUrlString(u, 'linkType')}>`).join(', ')
        : null;

      let turtle = `@prefix oslc_ldm: <${oslcLdmNamespace}> .\n`;
      turtle += `[] oslc_ldm:resources ${resourceList}`;
      if (predicateList) {
        turtle += ` ;\n   oslc_ldm:linkPredicates ${predicateList}`;
      }
      turtle += ` .\n`;

      const response = await this.client.post(url, turtle, {
        headers: {
          ...headers,
          'Content-Type': 'text/turtle'
        }
      });

      const contentType = response?.headers?.['content-type'] || 'text/turtle';
      return parseRdfTriples({
        data: response.data,
        contentType,
        baseIRI: url
      });
    };

    const postLegacyFormRequest = async objectFieldName => {
      const params = new URLSearchParams();
      for (const target of targetResourceURLs) {
        params.append(objectFieldName, asUrlString(target, 'targetResourceURL'));
      }
      for (const predicate of linkTypes) {
        params.append('predicateFilters', asUrlString(predicate, 'linkType'));
      }

      const response = await this.client.post(url, params.toString(), {
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      const contentType = response?.headers?.['content-type'] || 'text/turtle';
      return parseRdfTriples({
        data: response.data,
        contentType,
        baseIRI: url
      });
    };

    try {
      // Prefer the latest LDM spec behavior: RDF request/response bodies.
      return await postRdfRequest();
    } catch (err) {
      // Fallback for older/out-of-date servers.
      try {
        return await postLegacyFormRequest('objectResources');
      } catch (err2) {
        return await postLegacyFormRequest('objectConceptResources');
      }
    }
  }

  async #getIncomingLinksViaLqe(targetResourceURLs, linkTypes, configurationContext) {
    const endpoint = `${this.LDMServerBaseURL}/incoming-links`;

    const debugLqe = typeof process !== 'undefined' && process?.env?.DEBUG_LQE === 'true';
    if (debugLqe) {
      console.debug(`[LDMClient] LQE base URL: ${this.LDMServerBaseURL}`);
      console.debug(`[LDMClient] POST incoming-links to: ${endpoint}`);
    }

    // Build form-encoded body
    const params = new URLSearchParams();
    for (const url of targetResourceURLs) {
      params.append('targetUrl', asUrlString(url, 'targetResourceURL'));
    }
    // linkType is required by LQE — if none specified, send all known link types
    const effectiveLinkTypes = (Array.isArray(linkTypes) && linkTypes.length > 0)
      ? linkTypes
      : [...INVERSE_LINK_TYPES.keys()];
    for (const lt of effectiveLinkTypes) {
      params.append('linkType', asUrlString(lt, 'linkType'));
    }
    if (configurationContext) {
      params.append('oslc_config.context', asUrlString(configurationContext, 'configurationContext'));
    }

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'X-Jazz-CSRF-Prevent': '1',
    };
    if (configurationContext) {
      headers['Configuration-Context'] = asUrlString(configurationContext, 'configurationContext');
    }

    const hasAuthorizationHeader = () => {
      const common = this.client?.defaults?.headers?.common;
      return !!(common?.Authorization || common?.authorization);
    };

    const requestAuth = !hasAuthorizationHeader() && this.userid && this.password
      ? { username: this.userid, password: this.password }
      : undefined;

    if (debugLqe) {
      console.debug(`[LDMClient] incoming-links request body: ${params.toString()}`);
    }

    try {
      const response = await this.client.post(endpoint, params.toString(), {
        auth: requestAuth,
        headers,
        // Override base validateStatus — don't accept 401 for LQE requests
        // (LQE uses different auth from the app server)
        validateStatus: status => status < 400
      });
      const data = response.data;

      if (debugLqe) {
        console.debug(`[LDMClient] incoming-links response: numberOfResults=${data?.numberOfResults}`);
      }

      if (data?.error) {
        throw new Error(`LQE incoming-links error: ${data.error}`);
      }

      const results = data?.queryResults || [];
      return results.map(r => ({
        sourceURL: r.sourceUrl || '',
        linkType: r.linkType || '',
        targetURL: r.targetUrl || ''
      }));
    } catch (error) {
      const status = error?.response?.status;
      const msg = error?.response?.data?.error || error?.message || 'Unknown error';
      throw new Error(
        `request=POST ${endpoint} ` +
        `${status ? `status=${status} ` : ''}${msg}`
      );
    }
  }

}