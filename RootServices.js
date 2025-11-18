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

/** Encapsulates a Jazz rootservices document on an RDF Store
 *
 * @constructor
 * @param {string} uri - the URI of the Jazz rootservices resource
 * @param {Store} store - the RDF Knowledge Base for this rootservices resource
 * @param
 */
export default class RootServices extends OSLCResource {
	constructor(uri, store, etag=undefined) {
		// Store the RDF source in an internal representation for future use
		super(uri, store, etag)
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
	 * @param {!URI} serviceProviders - the URL of the rootservices. *serviceProviders element
	 * @returns {string} - the first matching service provider catalog URI
	 */
	serviceProviderCatalog(serviceProviders)  {
		var catalog = this.store.the(this.uri, serviceProviders)
		return catalog?.uri
	}
}

