import axios from 'axios';
import { sym, literal } from 'rdflib';
import * as $rdf from "rdflib";
import { DOMParser } from '@xmldom/xmldom';
import { CookieJar , Cookie} from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import { rdf, dcterms, rdfs, oslc, oslc_cm1, oslc_rm, oslc_qm1 } from './namespaces.js';
import { OSLCResource } from './OSLCResource.js';
import { Compact } from './Compact.js';
import { RootServices } from './RootServices.js';
import { ServiceProviderCatalog } from './ServiceProviderCatalog.js';
import { ServiceProvider } from './ServiceProvider.js';

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
export class OSLCClient {
    constructor(server_url, user, password) {
        this.base_url = server_url?.endsWith('/') ? server_url.slice(0, -1) : server_url;
        this.userid = user;
        this.password = password;
        this.rootservices = null;
        this.spc = null;
        this.sp = null;
        this.ownerMap = new Map();
        this.jar = new CookieJar();

        // Create axios instance with cookie agents
        wrapper(axios);
        this.client = axios.create({
            baseURL: this.baseURL,
            jar: this.jar,
            withCredentials: true,
            headers: {
                'Accept': 'text/turtle, application/rdf+xml;q=0.9, application/ld+json;q=0.8, application/json;q=0.7, application/xml;q=0.6, text/xml;q=0.5, */*;q=0.1',
                'OSLC-Core-Version': '2.0'
            },
            auth: {
                username: user,
                password: password
            }
        });

        // Response interceptor for handling auth challenges
        this.client.interceptors.response.use(
            async response => {
                const originalRequest = response.config;
                // Check if this is an authentication challenge
                if (response?.headers['x-com-ibm-team-repository-web-auth-msg'] === 'authrequired') {                           
                    try {                        
                        // Perform the login (JEE form auth typically uses j_username and j_password)
                        let authUrl = `${this.base_url}/j_security_check`;
                        await this.client.post(authUrl, {
                            'j_username': this.userid,
                            'j_password': this.password
                        }, {
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded'
                            },
                            validateStatus: () => true // Allow all status codes
                        });
                        // After successful login, retry the original request with updated cookies
                        response = await this.client(originalRequest);
                        return response;
                    } catch (error) {
                        console.error('Error during JEE authentication:', error.message);
                        return Promise.reject(error);
                    }
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
    async use(serviceProviderName, domain = 'CM') {
        // Read the server's rootservices document
        let resource;
        // Fetch the rootservices document, this is an unprotected resource
        try {
            resource = await this.getResource(`${this.base_url}/rootservices`);
            this.rootservices = new RootServices(resource.uri, resource.store, resource.etag);
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
            this.spc = new ServiceProviderCatalog(resource.uri, resource.store, resource.etag);
        } catch (error) {
            console.error('Error fetching ServiceProviderCatalog:', error);
        }

        // Lookup the the serviceProviderName in the ServiceProviderCatalog
        let spURL = this.spc.serviceProvider(serviceProviderName);
        if (!spURL) {
            throw new Error(`${serviceProviderName} not found in service catalog`);
        }        
        resource = await this.getResource(spURL);
        this.sp = new ServiceProvider(resource.uri, resource.store, resource.etag);
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
                console.log(err)
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
        $rdf.parse(response.data, graph, url, 'application/rdf+xml');
        return new Compact(url, graph, etag);
    }


    async putResource(resource, eTag = null, oslc_version = '2.0') {
        const graph = resource.store;
        if (!graph) {
            throw new Error('Resource has no data to update');
        }
        const url = graph.value; 
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
        const creationFactory = this.getCreationFactory(resourceType);
        if (!creationFactory) {
            throw new Error(`No creation factory found for ${resourceType}`);
        }
        const headers = {
            'Content-Type': 'application/rdf+xml; charset=utf-8',
            'Accept': 'application/rdf+xml; charset=utf-8',
            'OSLC-Core-Version': oslc_version
        };
        
        const body = graph.serialize(null, 'application/rdf+xml');
        const response = await this.client.post(creationFactory, body, { headers });
        
        if (response.status !== 200 && response.status !== 201) {
            throw new Error(`Failed to create resource. Status: ${response.status}\n${response.data}`);
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
            'OSLC-Core-Version': oslc_version
        };
        const response = await this.client.delete(url, { headers });
        
        if (response.status !== 200 && response.status !== 204) {
            throw new Error(`Failed to delete resource. Status: ${response.status}\n${response.data}`);
        }        
        return undefined;
    }

    async queryResources(resourceType, prefix = null, select = null, where = null, orderBy = null) {
        const kb = await this.query(resourceType, prefix, select, where, orderBy);
		// create an OSLCResource for each result member
		// TODO: getting the members must use the discovered member predicate, rdfs:member is the default
		let resources = [];
		let members = kb.statementsMatching(null, rdfs('member'), null);
		for (let member of members) {
			let memberStatements = kb.statementsMatching(member.object, undefined, undefined);
			let memberKb = $rdf.graph();
			memberKb.add(memberStatements);
			resources.push(new OSLCResource(member.object, memberKb));
		}
        return resources;
    }

    async query(resourceType, prefix = null, select = null, where = null, orderBy = null) {
        const queryBase = this.sp.getQueryBase(resourceType);
        if (!queryBase) {
            throw new Error(`No query capability found for ${resourceType}`);
        }
        return this.queryWithBase(queryBase, prefix, select, where, orderBy);
    }

    async queryWithBase(queryBase, prefix = null, select = null, where = null, orderBy = null) {
        const headers = {
            'OSLC-Core-Version': '2.0',
            'Accept': 'application/rdf+xml',
            'X-Jazz-CSRF-Prevent': '1'
        };
        
        const params = new URLSearchParams();
        if (prefix) params.append('oslc.prefix', prefix);
        if (select) params.append('oslc.select', select);
        if (where) params.append('oslc.where', where);
        if (orderBy) params.append('oslc.orderBy', orderBy);
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
            console.log(err)
        }                                
        let nextPage = store.any(sym(queryBase), oslc('nextPage'), null)?.value;
        while (nextPage) {
            response = await this.client.get(nextPage, { headers });
            try {
                $rdf.parse(response.data, store, url, contentType)
            } catch (err) {
                console.log(err)
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
        const store = $rdf.graph();
        try {
            $rdf.parse(response.data, store, url, contentType)
        } catch (err) {
            console.log(err)
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