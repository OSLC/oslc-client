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

var request = require('./oslcRequest')

var RootServices = require('./RootServices')
var ServiceProviderCatalog = require('./ServiceProviderCatalog')
var ServiceProvider = require('./ServiceProvider')
var OSLCResource = require('./resource')

var rdflib = require('rdflib')
require('./namespaces')

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
 * @param {!Symbol} serviceProviders - the rootservices oslc_*:*serviceProviders to connect to
 * @param {OSLCServer~noResultCallback} callback - called when the connection is established
 */
OSLCServer.prototype.connect = function(userId, password, serviceProviders, callback) {
	var _self = this // needed to refer to this inside nested callback functions
	_self.userId = userId
	_self.password = password
	// these are needed in request in order to respond to authentication challenges
	request.userId = userId
	request.password = password
	request.serverURI = this.serverURI

	// Get the Jazz rootservices document for OSLC v2
	// This does not require authentication
	_self.read(_self.serverURI+'/rootservices', function gotRootServices(err, resource) {
		if (err) return console.error("Could not read rootservices for "+_self.serverURI)
		_self.rootservices = new RootServices(resource.id.uri, resource.kb)
		// read the ServiceProviderCatalog, this does require authentication
		var catalogURI = _self.rootservices.serviceProviderCatalog(serviceProviders)
		_self.read(catalogURI, gotServiceProviderCatalog)
	})
	
	// Got the service provider catalog, it will be needed for any other request.
	function gotServiceProviderCatalog(err, resource) {
		if (err) return console.error('Failed to read the ServiceProviderCatalog '+err)
		_self.serviceProviderCatalog = new ServiceProviderCatalog(resource.id.uri, resource.kb)
		callback(undefined) // call the callback with no error
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
	// From the service provider catalog, get the service provider resource
	var serviceProviderURL = _self.serviceProviderCatalog.serviceProvider(serviceProviderTitle)
	if (!serviceProviderURL) return console.error(serviceProviderTitle + ' not found')
	_self.read(serviceProviderURL, function(err, resource) {
		if (err) return console.error('Unable to read '+serviceProviderURL)
		_self.serviceProvider = new ServiceProvider(resource.id.uri, resource.kb)
		callback(undefined) // call the callback with no error
	})
}

/** The OSLCServer provides typical HTTP CRUD functions on RDF resources */

/**
 * Create a new OSLC resource. An error is returned if the resource already exists
 *
 * @param {!Symbol} oslc:resourceType - the type of resource to create (the resource may have many types).
 * @param {!resource} resource - the data used to create the resource.
 * @param {OSLCServer~resultCallback} callback - callback with an error or the created OSLCResource
 */
OSLCServer.prototype.create = function(resourceType, resource, callback) {
	// TODO: complete the create function
	var creationFactory = this.serviceProvider.creationFactory(resourceType);
	var jsessionid = request.getCookie('JSESSIONID')
	rdflib.serialize(undefined, resource.kb, 'nobase:', 'application/rdf+xml', function(err, str) {
		var headers = {
			'Content-Type': 'application/rdf+xml',
			'Accept': 'application/rdf+xml',
			'OSLC-Core-Version': '2.0',
			'X-Jazz-CSRF-Prevent': jsessionid
		}
		var options = {
			uri: creationFactory,
			headers: headers,
			body: str
		}
		request.post(options, function gotCreateResults(err, response, body) {
			if (err || response.statusCode != 201) return console.error('Unable to create resource ('+response.statusCode+'): '+err)
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
	request.authGet(uri, function gotResult(err, response, body) {
		if (err || response.statusCode != 200) {
			return console.error('Unable to read resource '+uri+': '+err)
		}
		var kb = new rdflib.IndexedFormula()
		rdflib.parse(body, kb, uri, 'application/rdf+xml')
		var results = new OSLCResource(uri, kb)
		results.etag = response.headers['etag']
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
			if (err) return console.error('Unable to read by ID: '+err)
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
			if (err || response.statusCode != 200) return console.error('Unable to update resource: '+response.statusCode+' :'+err)
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
	var jsessionid = request.getCookie('JSESSIONID')
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
			return console.error('Unable to delete resource '+uri+': '+ response.statusCode + ' ' + err)
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
	request.authGet(queryURI, function gotQueryResults(err, response, body) {
		if (err) return console.error('Unable to execute query: '+err)
		if (response.statusCode != 200) return console.error('Unable to execute query: '+queryURI+' '+response.statusCode)
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
