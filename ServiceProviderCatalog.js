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

"use strict";

var rdflib = require('rdflib');
var ServiceProvider = require('./ServiceProvider');

// Define some useful namespaces

var FOAF = rdflib.Namespace("http://xmlns.com/foaf/0.1/");
var RDF = rdflib.Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
var RDFS = rdflib.Namespace("http://www.w3.org/2000/01/rdf-schema#");
var OWL = rdflib.Namespace("http://www.w3.org/2002/07/owl#");
var DCTERMS = rdflib.Namespace('http://purl.org/dc/terms/');
var DC = rdflib.Namespace("http://purl.org/dc/elements/1.1/");
var RSS = rdflib.Namespace("http://purl.org/rss/1.0/");
var XSD = rdflib.Namespace("http://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#dt-");
var CONTACT = rdflib.Namespace("http://www.w3.org/2000/10/swap/pim/contact#");
var OSLC = rdflib.Namespace("http://open-services.net/ns/core#");
var OSLCCM = rdflib.Namespace('http://open-services.net/ns/cm#');
var OSLCCM10 = rdflib.Namespace('http://open-services.net/xmlns/cm/1.0/');
var JD = rdflib.Namespace('http://jazz.net/xmlns/prod/jazz/discovery/1.0/')

/** Encapsulates a OSLC ServiceProviderCatalog resource as in-memroy RDF knowledge base
 * @class
 * @constructor
 * 
 * @param {!URI} uri - the ServiceProviderCatalog URI
 * @param {string} rdfSource - the RDF/XML for the ServiceProviderCatalog
 */
function ServiceProviderCatalog(uri, rdfSource) {
	// Parse the RDF source into an internal representation for future use
	var _self = this;
	_self.catalogURI = uri;
	_self.catalog = new rdflib.IndexedFormula();
	rdflib.parse(rdfSource, _self.catalog, uri, 'application/rdf+xml');
	_self.xmlLiteral = _self.catalog.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral');	
}

/** Get the ServiceProvider with the given service provider name. This will also load all the
 * services for that service provider so they are available for use.
 *
 * This is an example of an asnychronous constructor. The constructor returns immediately
 * with the constructed function, but its member variables are set asynchronously.
 * The actual constructed function is returned through a callback when it's
 * construction has completed.
 *
 * @param {String} serviceProviderTitle - the dcterms:title of the service provider (e.g., an RTC project area)
 * @param callback(err, serviceProvider) - called back when the ServiceProvider had been populated with Services
 */
ServiceProviderCatalog.prototype.serviceProvider = function(serviceProviderTitle, request, callback) {
	var sp = this.catalog.statementsMatching(undefined, DCTERMS('title'), this.catalog.literal(serviceProviderTitle, undefined, this.xmlLiteral));
	if (!sp) return console.log('Service Provider '+serviceProviderTitle+'  not found');
	var serviceProvider = new ServiceProvider(sp[0].subject.uri, request, function doneGettingServices(err) {
		if (err) return console.log('Cannot load services for '+serviceProviderTitle+': '+err);
		callback(undefined, serviceProvider); // the constructed ServiceProvider is now fully constructed
	});
}


module.exports = ServiceProviderCatalog;