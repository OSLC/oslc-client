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
var rdflib = require('rdflib')

var DCTERMS = rdflib.Namespace('http://purl.org/dc/terms/')


/** This is a generic OSLC resource. Properties for
 * a particular domain resource will be added dynamically
 * when it is read. This allows the OSLC module to be used
 * on any domain without change or extension.
 * @author Jim Amsden
 * @class
 * @parm {string} uri - the URI of this resource
 * @param {IndexedFormula} kb - the Knowledge Base that contains the resource RDF graph
 */
function OSLCResource(uri, kb) {
	if (uri) {
		this.id = rdflib.sym(uri)
		this.kb = kb
		// These are not valid QNames using prefix http://jazz.net/xmlns/prod/jazz/rtc/ext/1.0/, local part can't have dots
		kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/ext/1.0/com.ibm.team.apt.attribute.complexity'))
		kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/ext/1.0/com.ibm.team.apt.attribute.acceptance'))
		kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/cm/1.0/com.ibm.team.workitem.linktype.relatedworkitem.related'))
		kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/cm/1.0/com.ibm.team.workitem.linktype.resolvesworkitem.resolves'))
	} else {
		this.id = rdflib.blankNode()
		this.kb = new rdflib.IndexedFormula()
	}
	this.etag = undefined
}


/**
 * Get a property of the resource. This method assumes any property could
 * be multi-valued or undefined. Based on open-world assumptions, it is not
 * considered an error to attempt to get a property that doesn't exist. This
 * would simply return undefined.
 *
 * @param {string} property - the RDF property to get
 * @returns {Node} - undefined, single object URL or literal value, or array of values
 */
OSLCResource.prototype.get = function(property) {
	var result = this.kb.each(this.id, property)
	if (result.length === 1) {
		result = result[0]
	}
	return result
}

/**
 * The following accessor functions are for common OSLC core vocabulary
 * that most OSLC resources are likely to have. Subclasses for OSLC domain
 * vocabularies would likely add additional accessor methods for the 
 * properties defined in the domain specification.
 */

/**
 * Get the resource dcterms:identifier
 *
 * @returns {string} - dcterms:identifier value
 */
OSLCResource.prototype.getIdentifier = function() {
	return this.get(DCTERMS('identifier')).value
}

/**
 * Get the resource dcterms:title
 *
 * @returns {string} - dcterms:title value
 */
OSLCResource.prototype.getTitle = function() {
	var result = this.get(DCTERMS('title'))
	return Array.isArray(result)? result[0].value: result.value
}

/**
 * Get the resource dcterms:description
 *
 * @returns {string} - dcterms:description value
 */
OSLCResource.prototype.getDescription = function() {
	var result = this.get(DCTERMS('description'))
	return Array.isArray(result)? result[0].value: result.value
}

/**
 * Set the resource dcterms:title
 *
 * @param {string} value - dcterms:title value
 */
OSLCResource.prototype.setTitle = function(value) {
	this.set(DCTERMS('title'), rdflib.literal(value))
}

/**
 * Set the resource dcterms:description
 *
 * @param {string} value - dcterms:description value
 */
OSLCResource.prototype.setDescription = function(value) {
	this.set(DCTERMS('description'), rdflib.literal(value))
}



/**
 * Set a property of the resource. This method assumes any property could
 * be multi-valued or undefined. Based on open-world assumptions, it is not
 * considered an error to attempt to set a property that doesn't exist. So
 * set can be used to add new properties. Using undefined for the value will
 * remove the property.
 *
 * @param {string} property - the RDF property to set
 * @param {Node} value - the new value
 */
OSLCResource.prototype.set = function(property, value) {
	// first remove the current values
	var subject = this.id
	this.kb.remove(this.kb.statementsMatching(subject, property, undefined))
	if (typeof value == 'undefined') return
	if (Array.isArray(value)) {
		for (var i=0; i<value.length; i++) {
			this.kb.add(subject, property, value[i])
		}
	} else {
		this.kb.add(subject, property, value)
	}
}

module.exports = OSLCResource;