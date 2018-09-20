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
require('./namespaces')
var OSLCResource = require('./OSLCResource')


/** Encapsulates a OSLC ServiceProviderCatalog resource as in-memroy RDF knowledge base
 * @class
 *
 * @constructor
 * @param {string} uri - the URI of the Jazz rootservices resource
 * @param {IndexedFormula} kb - the RDF Knowledge Base for this rootservices resource
*/
class ServiceProviderCatalog extends OSLCResource {

	constructor(uri, kb) {
		// Parse the RDF source into an internal representation for future use
		super(uri, kb)
		var _self = this
		_self.xmlLiteral = _self.kb.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral')
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
	 * @returns {string} serviceProviderURL - the ServiceProvider URL had been populated with Services
	 */
	serviceProvider(serviceProviderTitle, callback) {
		var sp = this.kb.statementsMatching(undefined, DCTERMS('title'), this.kb.literal(serviceProviderTitle, undefined, this.xmlLiteral));
		if (!sp) {
			return undefined;
		} else {
			return sp[0].subject.uri
		}
	}
}

module.exports = ServiceProviderCatalog