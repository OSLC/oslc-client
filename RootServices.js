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
var OSLCCM10 = rdflib.Namespace('http://open-services.net/xmlns/cm/1.0/');
var JD = rdflib.Namespace('http://jazz.net/xmlns/prod/jazz/discovery/1.0/')

/** Encapsulates a Jazz rootservices document as in-memroy RDF knowledge base
 *
 * @constructor
 * @param {URI} uri - the URI of the Jazz rootservices resource
 * @param {string} rdfSource - the RDF/XML source for the rootservices resource
 */
function RootServices(uri, rdfSource) {
	// Parse the RDF source into an internal representation for future use
	this.rootServicesURI = uri;
	this.kb = new rdflib.IndexedFormula();
	rdflib.parse(rdfSource, this.kb, uri, 'application/rdf+xml');
	
}

/** The RTC rootservices document has a number of jd:oslcCatalogs properties
 * that contain inlined oslc:ServiceProviderCatalog instances.
 *  <jd:oslcCatalogs>
 *        <oslc:ServiceProviderCatalog rdf:about="https://oslclnx2.rtp.raleigh.ibm.com:9443/ccm/oslc/workitems/catalog">
 *            <oslc:domain rdf:resource="http://open-services.net/ns/cm#"/>
 *        </oslc:ServiceProviderCatalog>
 *  </jd:oslcCatalogs>
 * We want to get the URI for the CM oslc:domain Service Provider Catalog.
 * 
 * @param {!URI} domain - the domain of the service provider catalog you want to get
 * @returns {ServiceProviderCatalog} - the service provider catalog URI
 */
RootServices.prototype.serviceProviderCatalogURI = function(domain)  {
	var catalogURI = undefined;
	var catalogs = this.kb.each(this.kb.sym(this.rootServicesURI), JD('oslcCatalogs'));
	for (var c in catalogs) {
		var catalog = this.kb.statementsMatching(catalogs[c], OSLC('domain'), domain);
		if (catalog) return catalogs[c].uri;
	}
	return catalogURI;
}


module.exports = RootServices;