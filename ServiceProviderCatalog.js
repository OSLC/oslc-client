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

import OSLCResource from './OSLCResource.js';
import { dcterms } from './namespaces.js';

/** Encapsulates a OSLC ServiceProviderCatalog resource as in-memroy RDF knowledge base
 * @class
 *
 * @constructor
 * @param {string} uri - the URI of the OSLC ServiceProviderCatalog resource
 * @param {IndexedFormula} store - the RDF Knowledge Base for this service provider catalog 
 * @param {string} etag - the ETag of the resource
*/
export default class ServiceProviderCatalog extends OSLCResource {

	constructor(uri, store, etag=undefined) {
		// Parse the RDF source into an internal representation for future use
		super(uri, store, etag)
	}	

	/** Get the ServiceProvider with the given service provider name. This will also load all the
	 * services for that service provider so they are available for use.
	 *
	 * @param {String} serviceProviderTitle - the dcterms:title of the service provider (e.g., an EWM project area)
	 * @returns {string} serviceProviderURL - the matching ServiceProvider URL from the service provider catalog
	 */
	serviceProvider(serviceProviderTitle) {
		var sp = this.store.statementsMatching(undefined, dcterms('title'), this.store.literal(serviceProviderTitle
			, this.store.sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral')));
		if (!sp) {
			return undefined;
		} else {
			return sp[0].subject.uri
		}
	}
}
