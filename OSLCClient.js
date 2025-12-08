import axios from 'axios';
import { sym } from 'rdflib';
import * as $rdf from "rdflib";
import { rdfs, oslc, oslc_cm1, oslc_rm, oslc_qm1 } from './namespaces.js';
import OSLCResource from './OSLCResource.js';
import Compact from './Compact.js';
import RootServices from './RootServices.js';
import ServiceProviderCatalog from './ServiceProviderCatalog.js';
import ServiceProvider from './ServiceProvider.js';

// Conditional imports for Node.js only
let wrapper, CookieJar, DOMParser;
const isNodeEnvironment = typeof window === 'undefined';

if (isNodeEnvironment) {
    // Node.js imports
    const cookiejarSupport = await import('axios-cookiejar-support');
    wrapper = cookiejarSupport.wrapper;
    const toughCookie = await import('tough-cookie');
    CookieJar = toughCookie.CookieJar;
    const xmldom = await import('@xmldom/xmldom');
    DOMParser = xmldom.DOMParser;
} else {
    // Browser: use native DOMParser
    DOMParser = window.DOMParser;
}

// Service providers properties
const serviceProviders = {
    'CM': oslc_cm1('cmServiceProviders'),
    'RM': oslc_rm('rmServiceProviders'),
    'QM': oslc_qm1('qmServiceProviders')
};



/**
 * An OSLCClient provides a simple interface to access OSLC resources
 * and perform operations like querying, creating, and updating resources.
 * It handles authentication, service provider discovery, and resource management.
 */
export default class OSLCClient {
    constructor(user, password, configuration_context = null) {
        this.userid = user;
        this.password = password;
        this.configuration_context = configuration_context;
        this.rootservices = null;
        this.spc = null;
        this.sp = null;
        this.ownerMap = new Map();
        this.isNodeEnvironment = isNodeEnvironment;
        
        if (isNodeEnvironment) {
            this.jar = new CookieJar();
        }

        // Create a base configuration
        const baseConfig = {
            timeout: 30000,
            headers: {
                'Accept': 'application/rdf+xml, text/turtle;q=0.9, application/ld+json;q=0.8, application/json;q=0.7, application/xml;q=0.6, text/xml;q=0.5, */*;q=0.1',
                'OSLC-Core-Version': '2.0'
            },
            validateStatus: status => status === 401 || status < 400 // Accept all 2xx responses
        };

        // Configure for Node.js or Browser
        if (isNodeEnvironment) {
            // Node.js: use a cookie jar and keep-alive
            baseConfig.keepAlive = true;
            baseConfig.jar = this.jar;
            this.client = wrapper(axios.create(baseConfig));
        } else {
            // Browser: use withCredentials for automatic cookie handling
            baseConfig.withCredentials = true;
            this.client = axios.create(baseConfig);
        }

        // Add the Configuration-Context header if one is given
        if (configuration_context) {
            this.client.defaults.headers.common['Configuration-Context'] = configuration_context;
        }

        // Response interceptor for handling auth challenges
        this.client.interceptors.response.use(
            async response => {
                const originalRequest = response.config;
                const wwwAuthenticate = response?.headers?.['www-authenticate'];
                
                // Check if this is a JEE Forms authentication challenge
                if (response?.headers['x-com-ibm-team-repository-web-auth-msg'] === 'authrequired') {  
                    try {                        
                        // Perform the login (JEE form auth typically uses j_username and j_password)
                        let url = new URL(response.config.url);
                        const paths = url.pathname.split('/');
                        url.pathname = paths[1] ? `/${paths[1]}/j_security_check` : '/j_security_check';
                        
                        // In browser, form-based auth may require a backend proxy due to CORS
                        if (!isNodeEnvironment) {
                            console.warn('Form-based authentication in browser requires CORS-enabled backend or proxy');
                        }
                        
                        response = await this.client.post(url.toString(), 
                            new URLSearchParams({
                                'j_username': this.userid,
                                'j_password': this.password
                            }).toString(),
                            {
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded'
                                },
                                maxRedirects: 0,
                                validateStatus: (status) => status === 302 // for successful login
                            }
                        );
                        // After successful login, retry the original request with updated cookies
                        response = await this.client.request(originalRequest);
                        return response;
                    } catch (error) {
                        console.error('Error during JEE authentication:', error.message);
                        return Promise.reject(error);
                    }
                } else if (response.status === 401 &&  wwwAuthenticate?.includes('jauth realm')) {
                    const token_uri = wwwAuthenticate.match(/token_uri="([^"]+)"/)[1];
                    try {
                        // Refresh the token using the provided token_uri
                        const tokenResponse = await this.client.post(token_uri,
                            new URLSearchParams({
                                username: this.userid,
                                password: this.password,
                            }).toString(),
                            {
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    'Accept': 'text/plain',
                                }
                            }
                        );
                        // retry the original request with the new token
                        const newToken = tokenResponse.data; // Refresh token
                        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                        return await this.client.request(originalRequest); // Retry the request
                    } catch (error) {
                        console.error('Error during jauth realm authentication:', error.message);
                        return Promise.reject(error);
                    }  
                } else if (response.status === 401) {
                    // Retry with basic authentication for e.g., Jazz Authorization Server
                    originalRequest.auth = {
                        username: this.userid,
                        password: this.password
                    };
                    return await this.client.request(originalRequest);
                } else {
                    // No authentication challenge, proceed with the response
                    return response;
                }
            },
        );
    };

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
            console.error('Error fetching rootservices:', error);
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
            console.error('Error fetching ServiceProviderCatalog:', error);
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
        const headers = {
            'Accept': accept,
            'OSLC-Core-Version': oslc_version
        };
        
        let response         
        try {
            response = await this.client.get(url, { headers });
        } catch (error) {
            console.error('Error fetching resource:', error);
            throw error;
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
        const headers = {
            'Accept': accept,
            'OSLC-Core-Version': oslc_version
        };
        
        let response         
        try {
            response = await this.client.get(url, { headers });
        } catch (error) {
            console.error('Error fetching Compact resource:', error);
            throw error;
        }
        const etag = response.headers.etag;
        const contentType = response.headers['content-type'];
        
        // Create a new graph for this resource
        const graph = $rdf.graph();
        // contentType is application/x-oslc-compact+xml, but that is RDF/XML specific to OSLC Compact
        $rdf.parse(response.data, graph, url, 'application/rdf+xml');
        return new Compact(url, graph, etag);
    }


    async putResource(resource, eTag = null, oslc_version = '2.0') {
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
            throw new Error(
                `Failed to update resource ${url}. Status: ${response.status}\n${response.data}`
            );
        }
        return resource;
    }

    async createResource(resourceType, resource, oslc_version = '2.0') {
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
                throw new Error(`Failed to create resource. Status: ${response.status}\n${response.data}`);
            }        
        } catch (error) {
            console.error('Error creating resource:', error);
            throw error;
        }        
        const location = response.headers.location;
        resource = await this.getResource(location);
        return resource;
    }

    async deleteResource(resource, oslc_version = '2.0') {
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
                throw new Error(`Failed to delete resource. Status: ${response.status}\n${response.data}`);
            }
        } catch (error) {
            console.error('Error deleting resource:', error);
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
        if (this.ownerMap.has(url)) {
            return this.ownerMap.get(url);
        }
        
        const headers = { 'Accept': 'application/rdf+xml' };
        const response = await this.client.get(url, { headers });
        
        if (response.status !== 200) {
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