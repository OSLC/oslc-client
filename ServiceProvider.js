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
import {oslc} from './namespaces.js';


/** Encapsulates a OSLC ServiceProvider resource as in-memroy RDF knowledge base
 * This is an asynchronous constructor. The callback is called when the ServiceProvider
 * has discovered all its services
 * @class
 * @constructor
 * @param {!URI} uri - the URI of the ServiceProvider
 * @param {request} request - for making HTTP requests 
 * @param etag - the ETag of the resource
 */
export default class ServiceProvider extends OSLCResource {
	constructor(uri, store, etag=undefined) {
		// Parse the RDF source into an internal representation for future use
		super(uri, store, etag)
	}

	/*
	 * Get the queryBase URL for an OSLC QueryCapability with the given oslc:resourceType
	 *
	 * @param {Symbol} a symbol for the desired oslc:resourceType
	 * @returns {string} the queryBase URL used to query resources of that type 
	 */
	getQueryBase(resourceType) {
		let resourceTypeSym = (typeof resourceType === 'string')? this.store.sym(resourceType): resourceType;
		let services = this.store.each(this.uri, oslc('service'));
		for (let service of services) {
			var queryCapabilities = this.store.each(service, oslc('queryCapability'));
			for (let queryCapability of queryCapabilities) {
				if (this.store.statementsMatching(queryCapability, oslc('resourceType'), resourceTypeSym).length) {
					return this.store.the(queryCapability, oslc('queryBase')).value
				}
			}
		}
		return null
	}


	/*
	 * Get the creation URL for an OSLC CreationFactory with the given oslc:resourceType
	 *
	 * @param {Symbol | string} a symbol for, or the name of the desired oslc:resourceType
	 * @returns {string} the creation URL used to create resources of that type 
	 */
	getCreationFactory(resourceType) {
		var services = this.store.each(this.uri, oslc('service'))
		for (var service in services) {
			var creationFactories = this.store.each(services[service], oslc('creationFactory'));
			for (var creationFactory in creationFactories) {
				if (typeof(resourceType) === 'string') {
					var types = this.store.each(creationFactories[creationFactory], oslc('resourceType'))
					for (var aType in types) {
						if (types[aType].uri.endsWith(resourceType)) return this.store.the(creationFactories[creationFactory], oslc('creation')).uri
					}
				} else if (this.store.statementsMatching(creationFactories[creationFactory], oslc('resourceType'), resourceType).length === 1) {
					return this.store.the(creationFactories[creationFactory], oslc('creation')).uri
				}
			}
		}
		return null
	}
}

