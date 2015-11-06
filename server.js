/**
 * server is a JavaScript Node.js API for accessing OSLC resources. It provides a
 * convenient JavaScript interface to OSLC REST services, with all resources handled
 * using JSON-LD.
 */

var request = require('request').defaults({
	headers: {
		'Accept': 'application/rdf+xml',
		'OSLC-Core-Version': '2.0'
	},
	strictSSL: false,  		  // no need for certificates
	jar: true,                // cookie jar
	followAllRedirects: true  // for FORM based authentication
});

var RootServices = require('./RootServices');
var ServiceProviderCatalog = require('./ServiceProviderCatalog');
var OSLCResource = require('./resource');

var rdflib = require('rdflib');

// Define some useful namespaces

var FOAF = rdflib.Namespace("http://xmlns.com/foaf/0.1/");
var RDF = rdflib.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
var RDFS = rdflib.Namespace("http://www.w3.org/2000/01/rdf-schema#");
var OWL = rdflib.Namespace("http://www.w3.org/2002/07/owl#");
var DC = rdflib.Namespace("http://purl.org/dc/elements/1.1/");
var RSS = rdflib.Namespace("http://purl.org/rss/1.0/");
var XSD = rdflib.Namespace("http://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#dt-");
var CONTACT = rdflib.Namespace("http://www.w3.org/2000/10/swap/pim/contact#");
var OSLC = rdflib.Namespace("http://open-services.net/ns/core#");
var OSLCCM = rdflib.Namespace('http://open-services.net/ns/cm#');
var DCTERMS = rdflib.Namespace('http://purl.org/dc/terms/');

/**
 * All the OSLCServer methods are asynchronous since many of them
 * could take a while to execute. 
 */

/**
 * Construct a generic OSLC server that can be used on any OSLC domain
 * @constructor
 * @param {URI} servierURI - the server URI
 * @property {URI} serverURI - the URI of the OSLC server being accessed
 * @property {string} userName - the user name or authentication ID of the user
 * @property {string} password - the user's password credentials
 * @property {URI} providerContainerName - the project area the user wants to access
 * @property {RootServices} rootServices - the Jazz rootservices document
 * @property {ServiceProviderCatalog} serviceProviderCatalog - the servers' service provider catalog
 * @property {ServiceProvider} serviceProvider - A service provider describing available services
 */
function OSLCServer(serverURI) {
	this.serverURI = serverURI;
	this.userName = null;
	this.password = null;
	this.rootServices = null; 
	this.serviceProviderCatalog = null;
	this.providerContainerName = null; 
	this.serviceProvider = null;  
}

/**
 * Connect to the server with the given credentials
 *
 * @param {string} userName - the user name or authentication ID of the user
 * @param {string} password - the user's password credentials
 * @param callback(err) - called when the connection is established
 */
OSLCServer.prototype.connect = function(userName, password, callback) {
	var _self = this; // needed to refer to this inside nested callback functions
	_self.userName = userName;
	_self.password = password;

	// Get the Jazz rootservices document for OSLC v2
	// This does not require authentication
	request.get(_self.serverURI+'/rootservices', function gotRootServices(err, response, body) {
		if (err || response.statusCode != 200) 
			return console.error('Failed to read the Jazz rootservices resource '+err);
		_self.rootServices = new RootServices(_self.serverURI+'/rootservices', body);

		// Now get the ServiceProviderCatalog so that we know what services are provided
		var catalogURI = _self.rootServices.serviceProviderCatalogURI(OSLCCM());
		//require('request-debug')(request);
		// This request will require authentication through FORM based challenge response
		request.get(catalogURI, gotServiceProviderCatalog);
	});
	
	// Parse the service provider catalog, it will be needed for any other request.
	function gotServiceProviderCatalog(err, response, body) {
		if (response &&  response.headers['x-com-ibm-team-repository-web-auth-msg'] === 'authrequired') {
			return request.post(_self.serverURI+'/j_security_check?j_username='+_self.userName+'&j_password='+_self.password, gotServiceProviderCatalog);
		} else if (!response || response.statusCode != 200) {
			return console.error('Failed to read the CM ServiceProviderCatalog '+err);
		}
		_self.serviceProviderCatalog = new ServiceProviderCatalog(response.request.uri.href, body);
		callback(null); // call the callback with no error
	}
}

/**
 * Set the OSLCServer context to use the given ServiceProvider (e.g., project area).
 * After this call, all the Services for the ServiceProvider are known.
 *
 * @param {URI} providerContainerName - the ServiceProvider or LDP Container (e.g., project area) name
 * @param callback(err) - called when the context is set to the service provider
 */
OSLCServer.prototype.use = function(providerContainerName, callback) {
	var _self = this;
	_self.providerContainerName = providerContainerName;
	// From the service provider catalog, get the service provider resource(service.xml)
	// resource for the project area. 
	_self.serviceProviderCatalog.serviceProvider(providerContainerName, request, function doneGettingSP(err, serviceProvider) {
		_self.serviceProvider = serviceProvider;
		callback(undefined); // call the callback with no error
	});
}

/**
 * Create a new OSLC resource
 *
 * @param callback(err, result) - callback with an error or the created resource
 */
OSLCServer.prototype.create = function(err, callback) {
	// TODO: complete the create function
}

/**
 * Read or GET all the properties of a specific OSLC resource
 *
 * @param {string} resourceID - the OSLC resource ID
 * @param callback(err, result) - callback with an error or the read OSLCResource
 */
OSLCServer.prototype.read = function(resourceID, callback) {
	// GET the OSLC resource and convert it to a JavaScript object

	this.query({
		prefixes: '',
		select: '*',
		where: 'dcterms:identifier="'+resourceID+'"',
		orderBy: ''},  function (err, results) {
			if (err || results.length !== 1) return console.log('Unable to execute query: '+err);
			callback(err, results[0]);
		});
}

/**
 * Update an OSLCResource
 * 
 * @param {string} resourceID - the change request ID
 * @param callback(err) - callback with a potential error
 */
OSLCServer.prototype.update = function(resourceID, callback) {
	// Convert the OSLC Resource into an RDF/XML resource and PUT to the server
	callback(null);
}

/**
 * Delete an OSLCResource
 *
 * @param resourceID - the OSLC Resource ID
 * @param callback(err): callback with a potential error
 */
OSLCServer.prototype.delete = function(resourceID, callback) {
	// TODO: complete the delete function
}

/**
 * Execute an OSLC query on server resources (e.g., ChangeRequests)
 * 
 * @param options: options for the query. An object of the form:
 *   {prefexes: 'prefix=<URI>,...',   - a list of namespace prefixes and URIs to resolve prefexes in the query
 *    select: '*',  - a list of resource properties to return
 *    where: 'property=value',  - what resources to return
 * 	  orderBy: '+property'     - what properties and order to sort the result
 *  }
 *
 * A query with only a where clause returns a list of matching members URIs
 * A query with a select clause returns the matching members and the
 * RDF representation of the resource including the selected properties.
 *
 * @param callback(err, result) - called with the query results
 */
OSLCServer.prototype.query = function(options, callback) {
	// execute the query
	var queryBase = this.serviceProvider.queryBase();
	var queryURI = queryBase;
	queryURI += '?';
	if (options.select && options.select !== '') {
		queryURI += 'oslc.select='+options.select;
	}
	if (options.where && options.where !== null) {
		if (queryURI[-1] !== '?') queryURI += '&';
		queryURI += 'oslc.where='+options.where;
	}
	if (options.orderBy && options.orderBy !== '') {
		if (queryURI[-1] !== '?') queryURI += '&';
		queryURI += 'oslc.orderBy='+options.orderBy;
	}
	request.get(queryURI, function gotQueryResults(err, response, body) {
		if (err || response.statusCode != 200) return console.log('Unable to execute query: '+err);
		// iterate over the members creating an OSLCResource for each matching menber
		// that contains the selected properties
		var kb = new rdflib.IndexedFormula();
		rdflib.parse(body, kb, queryURI, 'application/rdf+xml');
		var results = [];
		var members = kb.each(kb.sym(queryBase), RDFS('member'));
		for (var m in members) {
			var member = new OSLCResource(members[m].uri);
			rdflib.fromRDF(kb, members[m], member);
			results.push(member);
		}
		callback(null, results);
	});
}

/**
 * Disconnect from the server and release any resources
 */
OSLCServer.prototype.disconnect = function() {
	// Logout from the server
}


module.exports = OSLCServer;
