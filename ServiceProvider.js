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

var rdflib = require('rdflib')
require('./namespaces')

var OSLCResource = require('./OSLCResource')


/** Encapsulates a OSLC ServiceProvider resource as in-memroy RDF knowledge base
 * This is an asynchronous constructor. The callback is called when the ServiceProvider
 * has discovered all its services
 * @class
 * @constructor
 * @param {!URI} uri - the URI of the ServiceProvider
 * @param {request} request - for making HTTP requests 
 * @param callback(err, serviceProvider) - called with the newly constructed and populated service provider
 */
class ServiceProvider extends OSLCResource {
	constructor(uri, kb) {
		// Parse the RDF source into an internal representation for future use
		super(uri, kb)
		var _self = this
	}

	/*
	 * Get the queryBase URL for an OSLC QueryCapability with the given oslc:resourceType
	 *
	 * @param {Symbol} a symbol for the desired oslc:resourceType
	 * @returns {string} the queryBase URL used to query resources of that type 
	 */
	queryBase(resourceType) {
		let resourceTypeSym = (typeof resourceType === 'string')? this.kb.sym(resourceType): resourceType;
		let services = this.kb.each(this.id, OSLC('service'));
		for (let service of services) {
			var queryCapabilities = this.kb.each(service, OSLC('queryCapability'));
			for (let queryCapability of queryCapabilities) {
				if (this.kb.statementsMatching(queryCapability, OSLC('resourceType'), resourceTypeSym).length) {
					return this.kb.the(queryCapability, OSLC('queryBase')).value
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
	creationFactory(resourceType) {
		var services = this.kb.each(this.id, OSLC('service'))
		for (var service in services) {
			var creationFactories = this.kb.each(services[service], OSLC('creationFactory'));
			// TODO: for now, find an RTC creation factory for only oslc:resourceType=oslc:ChangeRequest
			for (var creationFactory in creationFactories) {
				if (typeof(resourceType) === 'string') {
					var types = this.kb.each(creationFactories[creationFactory], OSLC('resourceType'))
					for (var aType in types) {
						if (types[aType].uri.endsWith(resourceType)) return this.kb.the(creationFactories[creationFactory], OSLC('creation')).uri
					}
				} else if (this.kb.statementsMatching(creationFactories[creationFactory], OSLC('resourceType'), resourceType).length === 1) {
					return this.kb.the(creationFactories[creationFactory], OSLC('creation')).uri
				}
			}
		}
		return null
	}
}

module.exports = ServiceProvider