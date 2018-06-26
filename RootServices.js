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
var OSLCResource = require('./OSLCResource')

require('./namespaces')

/** Encapsulates a Jazz rootservices document as in-memroy RDF knowledge base
 *
 * @constructor
 * @param {OSLCServer} server - the server providing this rootservices resource
 * @param {string} uri - the URI of the Jazz rootservices resource
 * @param {IndexedFormula} kb - the RDF Knowledge Base for this rootservices resource
 */
class RootServices extends OSLCResource {
	constructor(uri, kb) {
		// Parse the RDF source into an internal representation for future use
		super(uri, kb)
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
	 * @returns {string} - the service provider catalog URI
	 */
	serviceProviderCatalog(serviceProviders)  {
		var catalog = this.kb.the(this.id, serviceProviders)
		return catalog? catalog.uri: null
	}
}

module.exports = RootServices