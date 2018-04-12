/*
 * Copyright 2014 IBM Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict'

var request = require('request')
var cookies = request.jar()
// there must be a better way, but this works
cookies.getCookie = function(key) {
	var _cookies = this._jar.toJSON().cookies
	var value = null;
	for (var cookie in _cookies) {
		if (_cookies[cookie].key === key) {
			value = _cookies[cookie].value
			break
		}
	}
	return value
}

request = request.defaults({
	headers: {
		'Accept': 'application/rdf+xml',  // reliably available RDF representation
		'OSLC-Core-Version': '2.0'
	},
	strictSSL: false,  		  // no need for certificates
	jar: cookies,             // use this cookie jar to save cookies
	followAllRedirects: true  // for FORM based authentication
})

var RootServices = require('./RootServices')
var ServiceProviderCatalog = require('./ServiceProviderCatalog')
var OSLCResource = require('./resource')

var rdflib = require('rdflib')

// Define some useful namespaces

var FOAF = rdflib.Namespace("http://xmlns.com/foaf/0.1/")
var RDF = rdflib.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#")
var RDFS = rdflib.Namespace("http://www.w3.org/2000/01/rdf-schema#")
var OWL = rdflib.Namespace("http://www.w3.org/2002/07/owl#")
var DC = rdflib.Namespace("http://purl.org/dc/elements/1.1/")
var RSS = rdflib.Namespace("http://purl.org/rss/1.0/")
var XSD = rdflib.Namespace("http://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#dt-")
var CONTACT = rdflib.Namespace("http://www.w3.org/2000/10/swap/pim/contact#");
var OSLC = rdflib.Namespace("http://open-services.net/ns/core#")
var OSLCCM = rdflib.Namespace('http://open-services.net/ns/cm#')
var OSLAM = rdflib.Namespace('http://open-services.net/ns/am#')
var OSLRM = rdflib.Namespace('http://open-services.net/ns/rm#')
var OSLQM = rdflib.Namespace('http://open-services.net/ns/qm#')
var DCTERMS = rdflib.Namespace('http://purl.org/dc/terms/')

/**
 * All the OSLCServer methods are asynchronous since many of them
 * could take a while to execute. 
 */

/**
 * OSLCServer is he root of a JavaScript Node.js API for accessing OSLC resources. 
 * It provides a convenient JavaScript interface to OSLC REST services. This function 
 * constructs a generic OSLC server that can be used on any OSLC domain.
 *
 * @class
 * @constructor
 * @param {!URI} serverURI - the server URI
 * @property {URI} serverURI - the URI of the OSLC server being accessed
 * @property {string} userId - the user name or authentication ID of the user
 * @property {string} password - the user's password credentials
 * @property {URI} serviceProviderTitle - the project area the user wants to access
 * @property {RootServices} rootservices - the Jazz rootservices document
 * @property {ServiceProviderCatalog} serviceProviderCatalog - the server's service provider catalog
 * @property {ServiceProvider} serviceProvider - A service provider describing available services
 */
function OSLCServer(serverURI) {
	this.serverURI = serverURI;
	this.userId = null;
	this.password = null;
	this.rootservices = null; 
	this.serviceProviderCatalog = null;
	this.serviceProviderTitle = null; 
	this.serviceProvider = null;  
}

/** OSLCServer functions are all asynchronous and use a consistent callback
 * which provides error status information from the function. This function
 * has no return value, only a status.
 *
 * @callback OSLCServer~noResultCallback
 * @param {string} err - the error message if any
 */

/** OSLCServer functions are all asynchronous and use a consistent callback
 * which provides error status information from the function. This function
 * has an asynchronous result
 *
 * @callback OSLCServer~resultCallback
 * @param {string} err - the error message if any
 * @param {Object} result - the asynchronous function return value
 */

/**
 * Connect to the server with the given credentials
 *
 * @param {!string} userId   - the user's authentication ID credential
 * @param {!string} password - the user's password credential
 * @param {OSLCServer~noResultCallback} callback - called when the connection is established
 */
OSLCServer.prototype.connect = function(userId, password, callback) {
	var _self = this // needed to refer to this inside nested callback functions
	_self.userId = userId
	_self.password = password

	// Get the Jazz rootservices document for OSLC v2
	// This does not require authentication
	request.get(_self.serverURI+'/rootservices', function gotRootServices(err, response, body) {
		if (err || response.statusCode != 200) 
			return console.error('Failed to read the Jazz rootservices resource '+err)
		_self.rootservices = new RootServices(_self.serverURI+'/rootservices', body)

		// Now get the ServiceProviderCatalog so that we know what services are provided
		var catalogURI = _self.rootservices.serviceProviderCatalogURI(OSLCCM())
		//require('request-debug')(request)
		// This request will require authentication through FORM based challenge response
		request.get(catalogURI, gotServiceProviderCatalog)
	})
	
	// Parse the service provider catalog, it will be needed for any other request.
	function gotServiceProviderCatalog(err, response, body) {
		// Check for authentication challenge and try again after posting login credentials
		if (response &&  response.headers['x-com-ibm-team-repository-web-auth-msg'] === 'authrequired') {
			return request.post(_self.serverURI+'/j_security_check?j_username='+_self.userId+'&j_password='+_self.password, gotServiceProviderCatalog);
		} else if (!response || response.statusCode != 200) {
			return console.error('Failed to read the ServiceProviderCatalog '+err)
		}
		_self.serviceProviderCatalog = new ServiceProviderCatalog(response.request.uri.href, body)
		callback(null) // call the callback with no error
	}
}

/**
 * Set the OSLCServer context to use the given ServiceProvider (e.g., project area for the jazz.net apps).
 * After this call, all the Services for the ServiceProvider are known.
 *
 * @param {!URI} serviceProviderTitle - the ServiceProvider or LDP Container (e.g., project area) name
 * @param {OSLCServer~noResultCallback} callback - called when the context is set to the service provider
 */
OSLCServer.prototype.use = function(serviceProviderTitle, callback) {
	var _self = this
	_self.serviceProviderTitle = serviceProviderTitle
	// From the service provider catalog, get the service provider resource(service.xml)
	// resource for the project area. 
	_self.serviceProviderCatalog.serviceProvider(serviceProviderTitle, request, function doneGettingSP(err, serviceProvider) {
		if (err) return console.error(serviceProviderTitle + ' not found')
		_self.serviceProvider = serviceProvider
		callback(undefined) // call the callback with no error
	});
}

/** The OSLCServer provides typical HTTP CRUD functions on RDF resources */

/**
 * Create a new OSLC resource. An error is returned if the resource already exists
 *
 * @param {!resource} resource - the data used to create the resource.
 * @param {OSLCServer~resultCallback} callback - callback with an error or the created resource URL
 */
OSLCServer.prototype.create = function(resource, callback) {
	// TODO: complete the create function
	var creationFactory = this.serviceProvider.creationFactory();
	var jsessionid = cookies.getCookie('JSESSIONID')
	rdflib.serialize(undefined, resource.kb, 'nobase:', 'application/rdf+xml', function(err, str) {
		var headers = {
			'Content-Type': 'application/rdf+xml',
			'Accept': 'application/rdf+xml',
			'OSLC-Core-Version': '2.0',
			'X-Jazz-CSRF-Prevent': jsessionid
		}
		var options = {
			uri: creationFactory + '/task',
			headers: headers,
			body: str
		}
		request.post(options, function gotCreateResults(err, response, body) {
			console.log(response.statusCode)
			if (err || response.statusCode != 201) return console.log('Unable to create resource: '+err)
			var kb = new rdflib.IndexedFormula()
			var uri = response.headers['location']
			rdflib.parse(body, kb, uri, 'application/rdf+xml')
			var results = new OSLCResource(uri, kb)
			callback(null, results)
		})
    })
}

/**
 * Read or GET all the properties of a specific OSLC resource, An error is returned
 * if the resource doesn't exist
 *
 * @param {string} url - the OSLC resource URL
 * @param {OSLCServer~resultCallback} callback - callback with an error or the read OSLCResource
 */
OSLCServer.prototype.read = function(uri, callback) {
	// GET the OSLC resource and convert it to a JavaScript object
	request.get(uri, function gotResult(err, response, body) {
		if (err || response.statusCode != 200) {
			return console.log('Unable to read resource '+uri+': '+err)
		}
		var kb = new rdflib.IndexedFormula()
		rdflib.parse(body, kb, uri, 'application/rdf+xml')
		var results = new OSLCResource(uri, kb)
		results.etag = response.headers['etag']
		console.log(results.etag)
		callback(null, results)
	})
}

/**
 * Read or GET all the properties of a specific OSLC resource by its ID. An error is returned
 * if the resource doesn't exist
 *
 * @param {string} resourceID - the OSLC resource ID (i.e., its dcterms:identifier)
 * @param {OSLCServer~resultCallback} callback - callback with an error or the read OSLCResource
 */
OSLCServer.prototype.readById = function(resourceID, callback) {
	// GET the OSLC resource and convert it to a JavaScript object
	var _self = this
	this.query({
		prefixes: '',
		select: '*',
		where: 'dcterms:identifier="'+resourceID+'"',
		orderBy: ''},  function (err, queryBase, results) {
			if (err) return console.log('Unable to read by ID: '+err)
			var member = results.any(results.sym(queryBase), RDFS('member'))
			if (member) {
				_self.read(member.uri, function(err, resource) {
					callback(err, resource)
				})
			} else {
				callback(err, undefined)
			}
		})
}

/**
 * Update an OSLCResource. An error is returned
 * if the resource doesn't exist.
 * 
 * @param {OSLCResource} resource - the OSLC resource to update
 * @param {OSLCServer~noResultCallback} callback - callback with a potential error
 */
OSLCServer.prototype.update = function(resource, callback) {
	// Convert the OSLC Resource into an RDF/XML resource and PUT to the server
	// target must be undefined, and base must not be undefined to serialize properly
	// base doesn't matter because no OSLC resource will have any relative URIs
	rdflib.serialize(undefined, resource.kb, 'nobase:', 'application/rdf+xml', function(err, str) {
		var headers = {
			'Content-Type': 'application/rdf+xml',
			'OSLC-Core-Version': '2.0',
			'If-Match': resource.etag
		}
		var options = {
			uri: resource.id.uri,
			headers: headers,
			body: str
		}
		request.put(options, function gotUpdateResults(err, response, body) {
			if (err || response.statusCode != 200) return console.log('Unable to update resource: '+err)
			callback(err)
		});
    });
}

/**
 * Delete an OSLCResource. No error is returned if the resource doesn't exist.
 *
 * @param {!string} resourceID - the OSLC Resource ID
 * @param {OSLCServer~noResultCallback} callback - callback with a potential error
 */
OSLCServer.prototype.delete = function(uri, callback) {
	var jsessionid = cookies.getCookie('JSESSIONID')
	var headers = {
		'Accept': 'application/rdf+xml',
		'OSLC-Core-Version': '2.0',
		'X-Jazz-CSRF-Prevent': jsessionid
	}
	var options = {
		uri: uri,
		headers: headers
	}
	request.delete(options, function deleted(err, response, body) {
		if (err || (response.statusCode != 200 && response.statusCode != 204)) {
			return console.log('Unable to delete resource '+uri+': '+ response.statusCode + ' ' + err)
		}
		callback(err)
	});
}

/**
 * Execute an OSLC query on server resources (e.g., ChangeRequests)
 * 
 * A query with only a where clause returns a list of matching members URIs
 * A query with a select clause returns the matching members and the
 * RDF representation of the resource including the selected properties.
 *
 * @param {Object} options - options for the query. An object of the form:
 * @param {string} options.prefix - 'prefix=<URI>,...', a list of namespace prefixes and URIs to resolve prefexes in the query
 * @param {string} options.select - '*', a list of resource properties to return
 * @param {string} options.where - 'property=value', what resources to return
 * @param {string} options.orderBy - '+property', what properties and order to sort the result
 * @param {string, IndexedFormula} callback - called with the query results: err, queryBase, kb
 */
OSLCServer.prototype.query = function(options, callback) {
	// Construct the query URL and query parameters, then execute the query
	var queryBase = this.serviceProvider.queryBase();
	var queryURI = ""
	if (options.prefix) {
		queryURI += 'oslc.prefix='+options.prefix
	} else {
		// Add the default prefix definitions
		queryURI += 'oslc.prefix='
		queryURI += 'dcterms=<http://purl.org/dc/terms/>,'
		queryURI += 'foaf=<http://xmlns.com/foaf/0.1/>,'
		queryURI += 'owl=<http://www.w3.org/2002/07/owl#>,'
		queryURI += 'rdf=<http://www.w3.org/1999/02/22-rdf-syntax-ns#>,'
		queryURI += 'xsd=<http://www.w3.org/2001/XMLSchema#>,'
		queryURI += 'rdfs=<http://www.w3.org/2000/01/rdf-schema#>,'
		queryURI += 'ldp=<http://www.w3.org/ns/ldp#>,'
		queryURI += 'oslc=<http://open-services.net/ns/core#>,'
		queryURI += 'acc=<http://open-services.net/ns/core/acc#>,'
		queryURI += 'trs=<http://open-services.net/ns/core/trs#>'
	}
	queryURI = encodeURIComponent(queryURI)
	if (options.select) {
		queryURI += '&'
		queryURI += 'oslc.select='+encodeURIComponent(options.select)
	}
	if (options.where) {
		queryURI += '&'
		queryURI += 'oslc.where='+encodeURIComponent(options.where)
	}
	if (options.orderBy) {
		queryURI += '&'
		queryURI += 'oslc.orderBy='+encodeURIComponent(options.orderBy)
	}
	queryURI = queryBase + '?' + queryURI
	request.get(queryURI, function gotQueryResults(err, response, body) {
		if (err) return console.log('Unable to execute query: '+err)
		if (response.statusCode != 200) return console.log('Unable to execute query: '+queryURI+' '+response.statusCode)
		// return the 
		var kb = new rdflib.IndexedFormula()
		rdflib.parse(body, kb, queryURI, 'application/rdf+xml')
		callback(null, queryBase, kb)
	});
}

/**
 * Disconnect from the server and release any resources
 */
OSLCServer.prototype.disconnect = function() {
	// Logout from the server
}


module.exports = OSLCServer
