import axios from 'axios';
import { sym } from 'rdflib';
import * as $rdf from "rdflib";
import { rdfs, oslc, oslc_cm1, oslc_rm, oslc_qm1 } from './namespaces.js';
import OSLCResource from './OSLCResource.js';
import Compact from './Compact.js';
import RootServices from './RootServices.js';
import ServiceProviderCatalog from './ServiceProviderCatalog.js';
import ServiceProvider from './ServiceProvider.js';

// Conditional imports for Node.js only — loaded lazily to avoid top-level await
// which prevents browser bundlers (esbuild/webpack) from processing this module.
let wrapper, CookieJar, DOMParser;
const isNodeEnvironment = typeof window === 'undefined';
let _nodeModulesLoaded = false;

async function ensureNodeModules() {
    if (_nodeModulesLoaded) return;
    _nodeModulesLoaded = true;
    if (isNodeEnvironment) {
        const cookiejarSupport = await import('axios-cookiejar-support');
        wrapper = cookiejarSupport.wrapper;
        const toughCookie = await import('tough-cookie');
        CookieJar = toughCookie.CookieJar;
        const xmldom = await import('@xmldom/xmldom');
        DOMParser = xmldom.DOMParser;
    } else {
        DOMParser = window.DOMParser;
    }
}

// Service providers properties
const serviceProviders = {
    'CM': oslc_cm1('cmServiceProviders'),
    'RM': oslc_rm('rmServiceProviders'),
    'QM': oslc_qm1('qmServiceProviders')
};



const OSLC_CLIENT_LOG_REDACT_HEADER_KEYS = new Set(['authorization', 'cookie', 'set-cookie']);

function oslcClientSummarizeHeadersForLog(headers) {
    if (!headers || typeof headers !== 'object') return '';

    const out = {};
    const tryAdd = (k, v) => {
        const key = String(k || '').trim();
        if (!key) return;
        const lower = key.toLowerCase();
        if (OSLC_CLIENT_LOG_REDACT_HEADER_KEYS.has(lower)) {
            out[key] = '[redacted]';
            return;
        }
        const val = Array.isArray(v) ? v.join(',') : String(v ?? '');
        out[key] = val.length > 200 ? `${val.substring(0, 200)}…` : val;
    };

    if (headers.common && typeof headers.common === 'object') {
        for (const [k, v] of Object.entries(headers.common)) {
            tryAdd(k, v);
        }
    }

    for (const [k, v] of Object.entries(headers)) {
        if (k === 'common') continue;
        if (k === 'delete' || k === 'get' || k === 'head' || k === 'post' || k === 'put' || k === 'patch') continue;
        tryAdd(k, v);
    }

    try {
        const json = JSON.stringify(out);
        return json.length > 800 ? `${json.substring(0, 800)}…` : json;
    } catch {
        return '';
    }
}

function oslcClientSummarizeBodyForLog(data) {
    if (data == null) return '';

    let text = '';
    if (typeof data === 'string') {
        text = data;
    } else {
        try {
            text = JSON.stringify(data);
        } catch {
            text = String(data);
        }
    }

    text = String(text || '').trim();
    if (!text) return '';
    const max = 1200;
    return text.length > max ? `${text.substring(0, max)}…` : text;
}

function oslcClientLogHttpError(label, errorOrResponse) {
    const isAxiosError = !!errorOrResponse?.isAxiosError;
    const config = isAxiosError ? errorOrResponse?.config : errorOrResponse?.config;
    const response = isAxiosError ? errorOrResponse?.response : errorOrResponse;

    const method = String(config?.method || 'GET').toUpperCase();
    const url = String(config?.url || '').trim();

    let headers = config?.headers;
    if (headers && typeof headers.toJSON === 'function') {
        headers = headers.toJSON();
    }
    const headersText = oslcClientSummarizeHeadersForLog(headers);

    const status = response?.status;
    const bodyText = oslcClientSummarizeBodyForLog(response?.data);

    const parts = [];
    if (method || url) parts.push(`request=${method} ${url}`.trim());
    if (headersText) parts.push(`headers=${headersText}`);
    if (typeof status === 'number') parts.push(`status=${status}`);
    if (bodyText) parts.push(`body=${bodyText}`);

    const msgRaw = String(errorOrResponse?.message || '').trim();
    if (msgRaw) {
        const maxMsg = 300;
        const msg = msgRaw.length > maxMsg ? `${msgRaw.substring(0, maxMsg)}…` : msgRaw;
        parts.push(`message=${msg}`);
    }

    const summary = parts.join(' ');

    console.error(`[OSLCClient][HTTP ERROR] ${label}${summary ? `: ${summary}` : ''}`);
}

/** Maximum number of auth dispatch cycles before giving up */
const MAX_AUTH_DISPATCH_CYCLES = 3;

/** Maximum number of redirects to follow during programmatic SSO */
const MAX_SSO_REDIRECTS = 10;

/** Known IdP URL patterns for SSO redirect detection */
const IDP_PATTERNS = [
    '/adfs/ls', '/adfs/oauth2',
    '/oauth2/authorize', '/oauth2/authorization',
    '/oauth/authorize',
    '/auth/realms/',
    '/saml2/idp/', '/saml/sso',
    '/idp/SSO.saml2',
    '/connect/authorize',
];

/**
 * Check if a URL matches known Identity Provider patterns.
 * @param {string} url
 * @returns {boolean}
 */
export function isIdpUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return IDP_PATTERNS.some(pattern => lower.includes(pattern));
}

/**
 * An OSLCClient provides a simple interface to access OSLC resources
 * and perform operations like querying, creating, and updating resources.
 * It handles authentication, service provider discovery, and resource management.
 */

export default class OSLCClient {
    /**
     * @param {string} user - Username for authentication
     * @param {string} password - Password for authentication
     * @param {string|null} [configuration_context=null] - OSLC Configuration-Context URI
     * @param {Object} [options={}]
     * @param {import('tough-cookie').CookieJar} [options.cookieJar] - Shared CookieJar (Node.js only). If provided, used instead of creating a private jar.
     * @param {Function} [options.ssoCallback] - Async callback for interactive SSO authentication: (idpUrl: string) => CookieJar | boolean | null
     */
    constructor(user, password, configuration_context = null, options = {}) {
        this.userid = user;
        this.password = password;
        this.configuration_context = configuration_context;
        this.ssoCallback = options.ssoCallback ?? null;
        this._ldmBaseUrl = options.ldmBaseUrl || null;
        this.rootservices = null;
        this.spc = null;
        this.sp = null;
        this.ownerMap = new Map();
        this.isNodeEnvironment = isNodeEnvironment;
        this._options = options;
        this._initialized = false;

        // Create a base axios client — Node.js cookie jar support is applied
        // lazily in _ensureInitialized() to avoid top-level await.
        const baseConfig = {
            timeout: 30000,
            maxRedirects: 0,
            headers: {
                'Accept': 'application/rdf+xml, text/turtle;q=0.9, application/ld+json;q=0.8, application/json;q=0.7, application/xml;q=0.6, text/xml;q=0.5',
                'OSLC-Core-Version': '2.0'
            },
            validateStatus: status => status === 401 || status < 400
        };

        if (isNodeEnvironment) {
            baseConfig.keepAlive = true;
        } else {
            baseConfig.withCredentials = true;
        }
        this.client = axios.create(baseConfig);

        // Add the Configuration-Context header if one is given
        if (configuration_context) {
            this.client.defaults.headers.common['Configuration-Context'] = configuration_context;
        }

        // Response interceptor for handling auth challenges.
        // Requests marked with _oslcAuthHandled have already been through auth
        // dispatch (they are retries from the auth handlers) — pass them through.
        this.client.interceptors.response.use(
            async response => {
                if (response?.config?._oslcAuthHandled) {
                    return response;
                }
                return this._handleAuthDispatch(response, 0);
            },
            async error => {
                return Promise.reject(error);
            }
        );
    };

    /**
     * Lazily load Node.js modules and upgrade the axios client with cookie jar
     * support. Called automatically before the first network request.
     */
    async _ensureInitialized() {
        if (this._initialized) return;
        this._initialized = true;
        await ensureNodeModules();
        if (isNodeEnvironment) {
            this.jar = this._options.cookieJar ?? new CookieJar();
            this.client.defaults.jar = this.jar;
            this.client = wrapper(this.client);
        }
    }

    /**
     * Main auth dispatch — inspects response headers/status and routes to the
     * appropriate authentication handler. Re-dispatches after successful auth
     * to handle chained challenges.
     *
     * @param {Object} response - Axios response object
     * @param {number} cycle - Current dispatch cycle (prevents infinite loops)
     * @returns {Promise<Object>} Resolved response or rejection
     */
    async _handleAuthDispatch(response, cycle, attempted = []) {
        if (cycle >= MAX_AUTH_DISPATCH_CYCLES) {
            return this._createAuthExhaustedRejection(response, attempted);
        }

        const originalRequest = response.config;
        const headers = response?.headers || {};
        const wwwAuthenticate = headers['www-authenticate'];
        const authMsg = headers['x-com-ibm-team-repository-web-auth-msg'];
        const status = response?.status;
        const location = headers['location'];

        // 1. JEE Forms auth challenge
        // In the browser, skip FORM auth when ssoCallback is available — the browser
        // follows j_security_check redirects transparently, which can send credentials
        // to an SSO IdP (Keycloak, ADFS) where they don't belong. Let the ssoCallback
        // handle auth interactively instead.
        if (authMsg === 'authrequired' && !attempted.includes('jee-forms')) {
            if (isNodeEnvironment || !this.ssoCallback) {
                attempted.push('jee-forms');
                try {
                    const retryResponse = await this._handleJeeFormsAuth(originalRequest);
                    return this._handleAuthDispatch(retryResponse, cycle + 1, attempted);
                } catch (jeeError) {
                    oslcClientLogHttpError('JEE form auth failed, trying other methods', jeeError);
                    // Fall through to try other auth methods
                }
            }
        }

        // 2. JAS Bearer auth challenge
        if (wwwAuthenticate?.includes('jauth realm') && !attempted.includes('jas-bearer')) {
            const tokenUri = wwwAuthenticate.match(/token_uri="([^"]+)"/)?.[1];
            if (tokenUri) {
                attempted.push('jas-bearer');
                try {
                    const retryResponse = await this._handleJasBearerAuth(originalRequest, tokenUri);
                    return this._handleAuthDispatch(retryResponse, cycle + 1, attempted);
                } catch (error) {
                    // JAS bearer failure is terminal — if the server explicitly offers a token
                    // endpoint and it fails, there's no useful fallback (the token was server-specific).
                    oslcClientLogHttpError('Error during jauth realm authentication', error);
                    return Promise.reject(error);
                }
            }
        }

        // 3. Redirect handling (maxRedirects: 0 means all redirects reach the interceptor)
        if (status >= 300 && status < 400 && location) {
            const absoluteLocation = new URL(location, originalRequest.url).toString();

            if (isIdpUrl(absoluteLocation)) {
                // SSO redirect — route to SSO auth handler
                attempted.push('sso');
                try {
                    const retryResponse = await this._handleSsoAuth(originalRequest, absoluteLocation, cycle);
                    return this._handleAuthDispatch(retryResponse, cycle + 1, attempted);
                } catch (ssoError) {
                    // SSO failed — fall through to exhausted
                    return this._createAuthExhaustedRejection(response, attempted);
                }
            } else {
                // Non-IdP redirect — follow it manually (normal redirect behavior)
                const redirectConfig = { ...originalRequest, url: absoluteLocation, _oslcAuthHandled: false };
                // Avoid re-sending POST body on redirect (302/303 → GET)
                if (status === 302 || status === 303) {
                    redirectConfig.method = 'get';
                    delete redirectConfig.data;
                }
                const redirectResponse = await this.client.request(redirectConfig);
                return redirectResponse; // Goes through interceptor — _oslcAuthHandled is false so auth dispatch runs
            }
        }

        // 4. Basic auth fallback (plain 401 or authrequired that failed JEE)
        // In the browser, skip Basic auth when ssoCallback is available — the browser
        // follows redirects transparently, so Basic auth credentials can end up at an
        // SSO IdP where they don't belong. Let ssoCallback handle auth interactively.
        if ((status === 401 || authMsg === 'authrequired') && !attempted.includes('basic')) {
            if (isNodeEnvironment || !this.ssoCallback) {
                attempted.push('basic');
                try {
                    originalRequest.auth = {
                        username: this.userid,
                        password: this.password,
                    };
                    originalRequest._oslcAuthHandled = true;
                    const retryResponse = await this.client.request(originalRequest);
                    return this._handleAuthDispatch(retryResponse, cycle + 1, attempted);
                } catch (error) {
                    oslcClientLogHttpError('Basic auth failed', error);
                    // Fall through — let exhausted rejection handle it
                }
            }
        }

        // 5. Interactive SSO callback as last resort — when all automated methods
        // failed (or none matched) and we still have an auth failure, let the user
        // authenticate interactively via browser window.
        if ((status === 401 || authMsg === 'authrequired') && this.ssoCallback && !attempted.includes('sso-interactive')) {
            attempted.push('sso-interactive');
            try {
                const resourceUrl = originalRequest.url;
                const callbackResult = await this.ssoCallback(resourceUrl);
                if (callbackResult) {
                    if (isNodeEnvironment && CookieJar && callbackResult instanceof CookieJar) {
                        this.jar = callbackResult;
                    }
                    originalRequest._oslcAuthHandled = true;
                    delete originalRequest.auth; // Remove failed Basic auth
                    const retryResponse = await this.client.request(originalRequest);
                    return this._handleAuthDispatch(retryResponse, cycle + 1, attempted);
                }
            } catch (ssoError) {
                oslcClientLogHttpError('Interactive SSO callback failed', ssoError);
            }
        }

        // No authentication challenge or all methods already attempted
        if (status === 401 && attempted.length > 0) {
            // Still 401 after trying auth methods — all failed
            return this._createAuthExhaustedRejection(response, attempted);
        }

        // Non-401 response (success, or no auth challenge) — return as-is
        return response;
    }

    /**
     * Handle JEE Forms authentication (j_security_check).
     * @param {Object} originalRequest - The original axios request config
     * @returns {Promise<Object>} Response from retrying the original request
     */
    async _handleJeeFormsAuth(originalRequest) {
        let url = new URL(originalRequest.url);
        const paths = url.pathname.split('/');
        url.pathname = paths[1] ? `/${paths[1]}/j_security_check` : '/j_security_check';

        if (!isNodeEnvironment) {
            console.warn('Form-based authentication in browser requires CORS-enabled backend or proxy');
        }

        await this.client.post(url.toString(),
            new URLSearchParams({
                'j_username': this.userid,
                'j_password': this.password,
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                maxRedirects: 0,
                validateStatus: (status) => status === 302,
            }
        );

        // After successful login, retry the original request with updated cookies
        originalRequest._oslcAuthHandled = true;
        return await this.client.request(originalRequest);
    }

    /**
     * Handle JAS Bearer authentication.
     * @param {Object} originalRequest - The original axios request config
     * @param {string} tokenUri - The token endpoint URI from the www-authenticate header
     * @returns {Promise<Object>} Response from retrying the original request
     */
    async _handleJasBearerAuth(originalRequest, tokenUri) {
        const tokenResponse = await this.client.post(tokenUri,
            new URLSearchParams({
                username: this.userid,
                password: this.password,
            }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'text/plain',
                },
            }
        );
        const newToken = tokenResponse.data;
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        originalRequest._oslcAuthHandled = true;
        return await this.client.request(originalRequest);
    }

    /**
     * Handle SSO authentication via redirect to an Identity Provider.
     * In Node.js, first attempts programmatic SSO. If that fails and an
     * ssoCallback is available, delegates to the callback.
     *
     * @param {Object} originalRequest - The original axios request config
     * @param {string} idpUrl - The Identity Provider URL from the redirect
     * @param {number} cycle - Current dispatch cycle
     * @returns {Promise<Object>} Response from retrying the original request
     */
    async _handleSsoAuth(originalRequest, idpUrl, cycle) {
        // In Node.js, try programmatic SSO first (follow IdP redirects, submit credentials)
        if (isNodeEnvironment) {
            const result = await this._attemptProgrammaticSso(originalRequest, idpUrl);
            if (result) {
                return result;
            }
        }

        // If programmatic SSO failed or unavailable, try the ssoCallback
        if (this.ssoCallback) {
            const callbackResult = await this.ssoCallback(idpUrl);
            if (callbackResult) {
                // If callback returned a CookieJar, swap it in
                if (CookieJar && callbackResult instanceof CookieJar) {
                    this.jar = callbackResult;
                }
                // Retry the original request
                originalRequest._oslcAuthHandled = true;
                return await this.client.request(originalRequest);
            }
        }

        throw new Error(`SSO authentication required but not handled: ${idpUrl}`);
    }

    /**
     * Attempt programmatic SSO authentication by following the IdP redirect
     * chain, parsing the login form, and submitting credentials.
     *
     * @param {Object} originalRequest - The original axios request config
     * @param {string} idpUrl - The Identity Provider URL
     * @returns {Promise<Object|null>} Response if successful, null if not supported
     */
    async _attemptProgrammaticSso(originalRequest, idpUrl) {
        try {
            // Step 1: Follow redirect chain to reach the login page
            let currentUrl = idpUrl;
            let html = null;

            for (let i = 0; i <= MAX_SSO_REDIRECTS; i++) {
                let response;
                try {
                    response = await this.client.get(currentUrl, {
                        maxRedirects: 0,
                        validateStatus: () => true,
                    });
                } catch (error) {
                    // axios may throw on 3xx if base validateStatus rejects it
                    response = error.response;
                    if (!response) return null;
                }

                if (response.status >= 300 && response.status < 400 && response.headers?.location) {
                    // Follow redirect
                    currentUrl = new URL(response.headers.location, currentUrl).toString();
                    continue;
                }

                if (response.status >= 200 && response.status < 300) {
                    html = typeof response.data === 'string' ? response.data : '';
                    break;
                }

                // Unexpected status — bail out
                return null;
            }

            if (!html) return null;

            // Step 2: Parse the login form
            const formData = this._parseLoginForm(html, currentUrl);
            if (!formData) return null;

            // Step 3: POST credentials to the form action
            const params = new URLSearchParams();
            for (const [name, value] of Object.entries(formData.fields)) {
                params.append(name, value);
            }
            params.append(formData.usernameField, this.userid);
            params.append(formData.passwordField, this.password);

            const postResponse = await this.client.post(formData.action, params.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                maxRedirects: 5,
                validateStatus: () => true,
            });

            // Step 4: Detect whether credentials were rejected
            const postBody = typeof postResponse.data === 'string' ? postResponse.data : '';
            if (this._isLoginPage(postBody)) {
                // Got another login page — credentials rejected
                return null;
            }

            // Step 5: Success — retry the original request
            return await this.client.request(originalRequest);
        } catch (error) {
            console.warn('[_attemptProgrammaticSso] SSO attempt failed:', error.message);
            return null;
        }
    }

    /**
     * Parse an HTML login page to extract form action and input fields.
     *
     * @param {string} html - The HTML content of the login page
     * @param {string} pageUrl - The URL of the page (for resolving relative action URLs)
     * @returns {{ action: string, fields: Object, usernameField: string, passwordField: string } | null}
     */
    _parseLoginForm(html, pageUrl) {
        let doc;
        try {
            doc = new DOMParser().parseFromString(html, 'text/html');
        } catch {
            return null;
        }
        if (!doc) return null;

        // Find a form containing a password input
        const forms = doc.getElementsByTagName('form');
        let targetForm = null;
        for (let i = 0; i < forms.length; i++) {
            const inputs = forms[i].getElementsByTagName('input');
            for (let j = 0; j < inputs.length; j++) {
                const type = (inputs[j].getAttribute('type') || '').toLowerCase();
                if (type === 'password') {
                    targetForm = forms[i];
                    break;
                }
            }
            if (targetForm) break;
        }
        if (!targetForm) return null;

        // Extract action URL
        const rawAction = targetForm.getAttribute('action') || '';
        let action;
        try {
            action = new URL(rawAction, pageUrl).toString();
        } catch {
            return null;
        }

        // Extract hidden fields, username field, and password field
        const fields = {};
        let usernameField = null;
        let passwordField = null;

        const inputs = targetForm.getElementsByTagName('input');
        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const type = (input.getAttribute('type') || 'text').toLowerCase();
            const name = input.getAttribute('name');
            if (!name) continue;

            if (type === 'hidden') {
                fields[name] = input.getAttribute('value') || '';
            } else if (type === 'password') {
                passwordField = name;
            } else if (type === 'text' || type === 'email') {
                if (!usernameField) usernameField = name;
            }
        }

        if (!passwordField) return null;

        return { action, fields, usernameField: usernameField || 'username', passwordField };
    }

    /**
     * Check if HTML content appears to be a login page (contains a password input).
     *
     * @param {string} html - The HTML content to check
     * @returns {boolean}
     */
    _isLoginPage(html) {
        if (!html || typeof html !== 'string') return false;
        return /input[^>]+type=["']password["']/i.test(html);
    }

    /**
     * Create a structured AUTH_EXHAUSTED rejection.
     * @param {Object} response - The last response received
     * @param {string[]} attempted - Array of auth method names that were tried
     * @returns {Promise<never>} Rejected promise with structured error
     */
    _createAuthExhaustedRejection(response, attempted) {
        const error = new Error('Authentication exhausted — all methods failed');
        error.code = 'AUTH_EXHAUSTED';
        error.status = response?.status || 401;
        error.attempted = attempted;
        error.ssoDetected = attempted.includes('sso');
        error.url = response?.config?.url;
        return Promise.reject(error);
    }

    /**
     * Set the OSLCClient to use a given service provider of the given domain,
     *
     * @param {*} serviceProviderName
     * @param {*} domain
     */
    async use(server_url, serviceProviderName, domain = 'CM') {
        this.base_url = server_url?.endsWith('/') ? server_url.slice(0, -1) : server_url;

        // Read the server's rootservices document
        let resource;
        // Fetch the rootservices document, this is an unprotected resource
        try {
            resource = await this.getResource(`${this.base_url}/rootservices`);
            this.rootservices = new RootServices(resource.getURI(), resource.store, resource.etag);
        } catch (error) {
            oslcClientLogHttpError('Error fetching rootservices', error);
            throw new Error('Failed to fetch rootservices document');
        }

        // Get ServiceProviderCatalog URL from the rootservices resource
        const spcURL = this.rootservices.serviceProviderCatalog(serviceProviders[domain]);
        if (!spcURL) {
            throw new Error(`No ServiceProviderCatalog for ${domain} services`);
        }        
        try {
            resource = await this.getResource(spcURL);
            this.spc = new ServiceProviderCatalog(resource.getURI(), resource.store, resource.etag);
        } catch (error) {
            oslcClientLogHttpError('Error fetching ServiceProviderCatalog', error);
        }

        // Lookup the the serviceProviderName in the ServiceProviderCatalog
        let spURL = this.spc.serviceProvider(serviceProviderName);
        if (!spURL) {
            throw new Error(`${serviceProviderName} not found in service catalog`);
        }        
        resource = await this.getResource(spURL);
        this.sp = new ServiceProvider(resource.getURI(), resource.store, resource.etag);
    }

    /**
     * 
     * @param {*} url The URL of the resource
     * @param {*} oslc_version OSLC version to use, defaults to 2.0
     * @param {*} accept The Accept header value, defaults to 'application/rdf+xml'
     * @returns an OSLCResource object containing the resource data
     */
    async getResource(url, oslc_version = '2.0', accept = 'application/rdf+xml') {
        await this._ensureInitialized();
        const headers = {
            'Accept': accept,
            'OSLC-Core-Version': oslc_version
        };

        let response
        try {
            response = await this.client.get(url, { headers });
        } catch (error) {
            const status = error?.response?.status || error?.status;
            if (status !== 406) {
                oslcClientLogHttpError('Error fetching resource', error);
            }
            throw error;
        }

        if (response?.status >= 400) {
            if (response.status !== 406) {
                oslcClientLogHttpError('Error fetching resource', response);
            }
            throw new Error(`Request failed with status code ${response.status}`);
        }
        const etag = response.headers.etag;
        const contentType = response.headers['content-type'];
        
        // This only handles the headers that are used in the OSLC spec
        if (contentType.includes('text/xml') || contentType.includes('application/xml')) {
            return { etag, xml: new DOMParser().parseFromString(response.data) };
        } else if (contentType.includes('application/atom+xml')) {
            return { etag, feed: response.data };
        } else {
            // assume the content-type is some RDF representation
            // Create a new graph for this resource
            const graph = $rdf.graph();
            try {
                $rdf.parse(response.data, graph, url, contentType)
            } catch (err) {
                console.error(err)
            }                        
            return new OSLCResource(url, graph, etag);
        }        
        throw new Error(`Unsupported content type: ${contentType}`);
    }


    /**
     * 
     * @param {*} url The URL of the resource
     * @param {*} oslc_version OSLC version to use, defaults to 2.0
     * @param {*} accept The Accept header value, defaults to 'application/rdf+xml'
     * @returns an OSLCResource object containing the resource data
     */
    async getCompactResource(url, oslc_version = '2.0', accept = 'application/x-oslc-compact+xml') {
        await this._ensureInitialized();
        const headers = {
            'Accept': accept,
            'OSLC-Core-Version': oslc_version
        };
        
        let response
        try {
            response = await this.client.get(url, { headers });
        } catch (error) {
            // 4xx errors are expected for compact — resource may not support it
            const status = error?.response?.status || error?.status;
            if (!(status >= 400 && status < 500)) {
                oslcClientLogHttpError('Error fetching Compact resource', error);
            }
            throw error;
        }

        if (response?.status >= 400) {
            if (!(response.status >= 400 && response.status < 500)) {
                oslcClientLogHttpError('Error fetching Compact resource', response);
            }
            throw new Error(`Request failed with status code ${response.status}`);
        }
        const etag = response.headers.etag;
        const contentType = response.headers['content-type'];
        
        // Create a new graph for this resource
        const graph = $rdf.graph();
        // contentType is application/x-oslc-compact+xml, but that is RDF/XML specific to OSLC Compact
        try {
            $rdf.parse(response.data, graph, url, 'application/rdf+xml');
        } catch (parseError) {
            // rdflib may fail on RDF/XML with missing namespace declarations (e.g. ETM responses).
            // Fall back to regex-based title extraction from the raw XML.
            const text = typeof response.data === 'string' ? response.data : '';
            const titleMatch = text.match(/<(?:[a-zA-Z_][\w.-]*:)?title[^>]*>([^<]+)<\/(?:[a-zA-Z_][\w.-]*:)?title>/);
            const shortTitleMatch = text.match(/<(?:[a-zA-Z_][\w.-]*:)?shortTitle[^>]*>([^<]+)<\/(?:[a-zA-Z_][\w.-]*:)?shortTitle>/);
            if (titleMatch || shortTitleMatch) {
                // Inject extracted values into the graph so the Compact class can find them
                const oslcNs = 'http://open-services.net/ns/core#';
                const dctermsNs = 'http://purl.org/dc/terms/';
                const subject = $rdf.sym(url);
                if (titleMatch) {
                    graph.add(subject, $rdf.sym(dctermsNs + 'title'), $rdf.lit(titleMatch[1].trim()));
                }
                if (shortTitleMatch) {
                    graph.add(subject, $rdf.sym(oslcNs + 'shortTitle'), $rdf.lit(shortTitleMatch[1].trim()));
                }
            } else {
                // No title found even via regex — re-throw so caller can handle
                throw parseError;
            }
        }
        return new Compact(url, graph, etag);
    }


    async putResource(resource, eTag = null, oslc_version = '2.0') {
        await this._ensureInitialized();
        const graph = resource.store;
        if (!graph) {
            throw new Error('Resource has no data to update');
        }
        const url = resource.getURI(); 
        const headers = {
            'OSLC-Core-Version': oslc_version,
            'Content-Type': 'application/rdf+xml; charset=utf-8',
            'Accept': 'application/rdf+xml'
        };        
        if (eTag) {
            headers['If-Match'] = eTag;
        }        
        const body = graph.serialize(null, 'application/rdf+xml');     
        const response = await this.client.put(url, body, { headers });
        
        if (response.status !== 200 && response.status !== 201) {
            oslcClientLogHttpError('Failed to update resource', response);
            throw new Error(
                `Failed to update resource ${url}. Status: ${response.status}\n${response.data}`
            );
        }
        return resource;
    }

    async createResource(resourceType, resource, oslc_version = '2.0') {
        await this._ensureInitialized();
        const graph = resource.store;
        if (!graph) {
            throw new Error('Resource has no data to create');
        }
        const creationFactory = this.sp.getCreationFactory(resourceType);
        if (!creationFactory) {
            throw new Error(`No creation factory found for ${resourceType}`);
        }
        const headers = {
            'Content-Type': 'application/rdf+xml; charset=utf-8',
            'Accept': 'application/rdf+xml; charset=utf-8',
            'OSLC-Core-Version': oslc_version
        };
        
        const body = graph.serialize(null, 'application/rdf+xml');
        let response = null;
        try {
            response = await this.client.post(creationFactory, body, { headers });
            if (response.status !== 200 && response.status !== 201) {
                oslcClientLogHttpError('Failed to create resource', response);
                throw new Error(`Failed to create resource. Status: ${response.status}\n${response.data}`);
            }        
        } catch (error) {
            oslcClientLogHttpError('Error creating resource', error);
            throw error;
        }        
        const location = response.headers.location;
        resource = await this.getResource(location);
        return resource;
    }

    async deleteResource(resource, oslc_version = '2.0') {
        await this._ensureInitialized();
        const graph = resource.store;
        if (!graph) {
            throw new Error('Resource has no data to delete');
        }
        const url = resource.getURI(); 
        const headers = {
            'Accept': 'application/rdf+xml; charset=utf-8',
            'OSLC-Core-Version': oslc_version,
            'X-Jazz-CSRF-Prevent': '1'
        };
        
        // In Node.js, try to get JSESSIONID from cookie jar
        if (isNodeEnvironment && this.jar) {
            try {
                const cookies = this.jar.getCookiesSync(url);
                const sessionCookie = cookies.find(cookie => cookie.key === 'JSESSIONID');
                if (sessionCookie) {
                    headers['X-Jazz-CSRF-Prevent'] = sessionCookie.value;
                }
            } catch (error) {
                // If cookie retrieval fails, continue with default value
                console.debug('Could not retrieve JSESSIONID from cookie jar:', error.message);
            }
        }
        
        try {
            const response = await this.client.delete(url, { headers });
            if (response.status !== 200 && response.status !== 204) {
                oslcClientLogHttpError('Failed to delete resource', response);
                throw new Error(`Failed to delete resource. Status: ${response.status}\n${response.data}`);
            }
        } catch (error) {
            oslcClientLogHttpError('Error deleting resource', error);
            throw error;
        }           
        return undefined;
    }

    async queryResources(resourceType, query) {
        const kb = await this.query(resourceType, query);
		// create an OSLCResource for each result member
		// TODO: getting the members must use the discovered member predicate, rdfs:member is the default
		let resources = [];
		let members = kb.statementsMatching(null, rdfs('member'), null);
		for (let member of members) {
			let memberStatements = kb.statementsMatching(member.object, undefined, undefined);
			let memberKb = $rdf.graph();
			memberKb.add(memberStatements);
			resources.push(new OSLCResource(member.object.value, memberKb));
		}
        return resources;
    }

    async query(resourceType, query) {
        const queryBase = this.sp.getQueryBase(resourceType);
        if (!queryBase) {
            throw new Error(`No query capability found for ${resourceType}`);
        }
        return this.queryWithBase(queryBase, query);
    }

    async queryWithBase(queryBase, query) {
        await this._ensureInitialized();
        const headers = {
            'OSLC-Core-Version': '2.0',
            'Accept': 'application/rdf+xml',
            'X-Jazz-CSRF-Prevent': '1'
        };
        
        const params = new URLSearchParams();
        if (query?.prefix) params.append('oslc.prefix', query.prefix);
        if (query?.select) params.append('oslc.select', query.select);
        if (query?.where) params.append('oslc.where', query.where);
        if (query?.orderBy) params.append('oslc.orderBy', query.orderBy);
        params.append('oslc.paging', 'false');
        
        let url = `${queryBase}?${params.toString()}`;
        let response = await this.client.get(url, { headers });
        if (response.status !== 200) {
            oslcClientLogHttpError('Failed to query resource', response);
            throw new Error(`Failed to query resource. Status: ${response.status}\n${response.data}`);
        }
        const contentType = response.headers['content-type'];
        const store = $rdf.graph();
        try {
            $rdf.parse(response.data, store, url, contentType)
        } catch (err) {
            console.error(err)
        }                                
        let nextPage = store.any(sym(queryBase), oslc('nextPage'), null)?.value;
        while (nextPage) {
            response = await this.client.get(nextPage, { headers });
            try {
                $rdf.parse(response.data, store, url, contentType)
            } catch (err) {
                console.error(err)
            }                                
            nextPage = store.any(sym(nextPage), oslc('nextPage'), null)?.value;
        }
        
        return store;
    }

    async getOwner(url) {
        await this._ensureInitialized();
        if (this.ownerMap.has(url)) {
            return this.ownerMap.get(url);
        }
        
        const headers = { 'Accept': 'application/rdf+xml' };
        const response = await this.client.get(url, { headers });
        
        if (response.status !== 200) {
            oslcClientLogHttpError('Failed to get owner (non-200 response)', response);
            return 'Unknown';
        }        
        const contentLocation = response.headers['content-location'] || url;
        const contentType = response.headers['content-type'];
        const store = $rdf.graph();
        try {
            $rdf.parse(response.data, store, url, contentType)
        } catch (err) {
            console.error(err)
        }                                
        const name = store.any(
            sym(contentLocation), 
            sym('http://xmlns.com/foaf/0.1/name'), 
            null
        )?.value;
        
        if (name) {
            this.ownerMap.set(url, name);
            return name;
        }        
        return 'Unknown';
    }

    /**
     * Get incoming links to the given target resource URLs, returning
     * already-inverted triples (with inverseLinkType).
     * Delegates to LDMClient (composition helper).
     *
     * @param {string[]} targetResourceURLs - URLs of resources to find incoming links for
     * @param {string[]} linkTypes - optional filter of link type URIs
     * @returns {Promise<Array<{targetURL: string, inverseLinkType: string, sourceURL: string}>>}
     */
    async getIncomingLinks(targetResourceURLs, linkTypes = []) {
        if (!this._ldmBaseUrl) return [];
        await this._ensureInitialized();

        const { default: LDMClient } = await import('./LDMClient.js');
        const ldm = new LDMClient(this, this._ldmBaseUrl);
        const triples = await ldm.getIncomingLinks(targetResourceURLs, linkTypes);
        return ldm.invert(triples);
    }

    async getQueryBase(resourceType) {
        const query = `
            PREFIX oslc: ${oslc()}
            SELECT ?qb WHERE {
                ?sp oslc:service ?s .
                ?s oslc:queryCapability ?qc .
                ?qc oslc:resourceType <${resourceType}> .
                ?qc oslc:queryBase ?qb .
            }`;
        
        const results = this.sp.store.querySync(query);
        if (!results?.length) {
            throw new Error(`No query capability found for ${resourceType}`);
        }
        return results[0].qb.value;
    }

    async getCreationFactory(resourceType) {
        const query = `
            PREFIX oslc: <${oslc().uri}>
            SELECT ?cfurl WHERE {
                ?sp oslc:service ?s .
                ?s oslc:creationFactory ?cf .
                ?cf oslc:usage <${resourceType}> .
                ?cf oslc:creation ?cfurl .
            }`;
        
        const results = await this.sp.store.sparqlQuery(query);
        if (!results?.length) {
            throw new Error(`No creation factory found for ${resourceType}`);
        }
        return results[0].cfurl.value;
    }
}