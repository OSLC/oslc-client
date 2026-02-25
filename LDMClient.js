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
    const sparql = this.#buildIncomingLinksSparql(targetResourceURLs, linkTypes);

    const debugLqe = typeof process !== 'undefined' && process?.env?.DEBUG_LQE === 'true';
    if (debugLqe) {
      console.debug(`[LDMClient] LQE base URL: ${this.LDMServerBaseURL}`);
      console.debug('[LDMClient] SPARQL request body:');
      console.debug(sparql);
    }

    const candidates = [
      `${this.LDMServerBaseURL}/sparql`
    ];

    const baseHeaders = {
      'Accept': 'application/sparql-results+json',
      'X-Jazz-CSRF-Prevent': '1'
    };
    if (configurationContext) {
      baseHeaders['Configuration-Context'] = asUrlString(configurationContext, 'configurationContext');
    }

    const hasAuthorizationHeader = () => {
      const common = this.client?.defaults?.headers?.common;
      return !!(common?.Authorization || common?.authorization);
    };

    const requestAuth = !hasAuthorizationHeader() && this.userid && this.password
      ? { username: this.userid, password: this.password }
      : undefined;

    const postSparqlQueryBody = async endpoint => {
      return await this.client.post(endpoint, sparql, {
        auth: requestAuth,
        headers: {
          ...baseHeaders,
          'Content-Type': 'application/sparql-query'
        }
      });
    };

    const postFormEncodedQuery = async endpoint => {
      const body = new URLSearchParams({ query: sparql }).toString();
      return await this.client.post(endpoint, body, {
        auth: requestAuth,
        headers: {
          ...baseHeaders,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
    };

    const isMissingQueryStringError = err => {
      const status = err?.response?.status;
      if (status !== 400) return false;
      const data = err?.response?.data;
      const text = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
      const msg = err?.message || '';
      return /does not contain a query string/i.test(text) || /does not contain a query string/i.test(msg);
    };

    let lastError;
    for (const endpoint of candidates) {
      try {
        if (debugLqe) {
          console.debug(`[LDMClient] POST SPARQL to: ${endpoint}`);
        }
        let response;
        try {
          response = await postSparqlQueryBody(endpoint);
        } catch (err) {
          if (isMissingQueryStringError(err)) {
            response = await postFormEncodedQuery(endpoint);
          } else {
            throw err;
          }
        }
        return this.#parseLqeResponseToTriples(response, endpoint);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Failed to query LQE for incoming links');
  }

  #buildIncomingLinksSparql(targetResourceURLs, linkTypes) {
    const objects = targetResourceURLs.map(u => `<${asUrlString(u, 'targetResourceURL')}>`).join(' ');

    const whereParts = [`VALUES ?o { ${objects} }`, '?s ?p ?o .'];

    if (Array.isArray(linkTypes) && linkTypes.length > 0) {
      const predicates = linkTypes.map(u => `<${asUrlString(u, 'linkType')}>`).join(' ');
      whereParts.unshift(`VALUES ?p { ${predicates} }`);
    }

    return `SELECT ?s ?p ?o WHERE { ${whereParts.join(' ')} }`;
  }

  #parseLqeResponseToTriples(response, baseIRI) {
    const debugLqe = typeof process !== 'undefined' && process?.env?.DEBUG_LQE === 'true';
    const contentType = response?.headers?.['content-type'] || '';
    const data = response?.data;
    const status = response?.status;
    const wwwAuthenticate = response?.headers?.['www-authenticate'] || '';
    const webAuthMsg = response?.headers?.['x-com-ibm-team-repository-web-auth-msg'] || '';

    if (debugLqe) {
      console.debug(`[LDMClient] LQE response content-type: ${contentType}`);
      console.debug(`[LDMClient] LQE response data type: ${typeof data}`);
    }

    if (status === 401 || (typeof data === 'string' && /unauthorized/i.test(data))) {
      const bodyText = typeof data === 'string' ? data.trim() : (data ? JSON.stringify(data) : '');
      throw new Error(
        `LQE unauthorized. status=${status}. content-type=${contentType}. ` +
        `www-authenticate=${wwwAuthenticate}. ` +
        `x-com-ibm-team-repository-web-auth-msg=${webAuthMsg}. ` +
        (wwwAuthenticate?.includes('OAuth realm') ? 'Note: LQE is requesting OAuth Authorization; provide an Authorization header (e.g., Bearer token). ' : '') +
        `body=${bodyText}`
      );
    }

    if (/sparql-results\+json/i.test(contentType) || /application\/json/i.test(contentType) || typeof data === 'object') {
      return this.#parseSparqlResultsIntoTriples(data);
    }

    if (/text\/turtle/i.test(contentType) || /application\/rdf\+xml/i.test(contentType) || /application\/ld\+json/i.test(contentType)) {
      return parseRdfTriples({ data, contentType, baseIRI });
    }

    if (typeof data === 'string') {
      const trimmed = data.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return this.#parseSparqlResultsIntoTriples(JSON.parse(trimmed));
        } catch (e) {
          if (debugLqe) {
            console.debug('[LDMClient] failed to JSON.parse response body');
          }
        }
      }
      if (trimmed.startsWith('@prefix') || trimmed.startsWith('<') || trimmed.includes('PREFIX ')) {
        try {
          return parseRdfTriples({ data, contentType: 'text/turtle', baseIRI });
        } catch (e) {
          if (debugLqe) {
            console.debug('[LDMClient] failed to parse response body as turtle');
          }
        }
      }
    }

    const snippet = typeof data === 'string' ? data.slice(0, 800) : JSON.stringify(data)?.slice(0, 800);
    throw new Error(`Unexpected SPARQL results format. content-type=${contentType}. body=${snippet}`);
  }

  #parseSparqlResultsIntoTriples(results) {
    let obj = results;
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch {
        obj = null;
      }
    }

    const bindings = obj?.results?.bindings || obj?.bindings;
    if (!Array.isArray(bindings)) {
      const rows = obj?.results;
      if (Array.isArray(rows)) {
        return rows
          .map(r => ({
            sourceURL: r?.s?.value || r?.s || r?.subject?.value || r?.subject,
            linkType: r?.p?.value || r?.p || r?.predicate?.value || r?.predicate,
            targetURL: r?.o?.value || r?.o || r?.object?.value || r?.object
          }))
          .filter(t => t.sourceURL && t.linkType && t.targetURL);
      }

      const debugLqe = typeof process !== 'undefined' && process?.env?.DEBUG_LQE === 'true';
      if (debugLqe) {
        console.debug('[LDMClient] Unexpected SPARQL JSON shape');
        console.debug(obj);
      }
      throw new Error('Unexpected SPARQL results format');
    }

    return bindings
      .map(b => ({
        sourceURL: b?.s?.value,
        linkType: b?.p?.value,
        targetURL: b?.o?.value
      }))
      .filter(t => t.sourceURL && t.linkType && t.targetURL);
  }
}