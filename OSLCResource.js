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
 *
 * However, subclasses could be created for any OSLC domain
 * as a convenience for those domain resources.

 * @author Jim Amsden
 * @class
 * @parm {string} uri - the URI of this resource
 * @param {IndexedFormula} kb - the Knowledge Base that contains the resource RDF graph
 */
class OSLCResource {

	constructor(uri, kb) {
		if (uri) {
			this.id = rdflib.sym(uri)
			this.kb = kb
			// These are not valid QNames using prefix http://jazz.net/xmlns/prod/jazz/rtc/ext/1.0/, local part can't have dots?
			// These parse ok, but don't serialize, XML qnames can have dots. This is an rdflib defect
			kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/ext/1.0/com.ibm.team.apt.attribute.complexity'))
			kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/ext/1.0/com.ibm.team.apt.attribute.acceptance'))
			kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/cm/1.0/com.ibm.team.workitem.linktype.relatedworkitem.related'))
			kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/cm/1.0/com.ibm.team.workitem.linktype.resolvesworkitem.resolves'))
			kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/cm/1.0/com.ibm.team.build.linktype.reportedWorkItems.com.ibm.team.build.common.link.reportedAgainstBuilds'))
			kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/cm/1.0/com.ibm.team.enterprise.promotion.linktype.promotedBuildMaps.promotedBuildMaps'))
			kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/cm/1.0/com.ibm.team.enterprise.promotion.linktype.promotionBuildResult.promotionBuildResult'))
			kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/cm/1.0/com.ibm.team.enterprise.promotion.linktype.promotionDefinition.promotionDefinition'))
			kb.removeMany(kb.sym(uri), kb.sym('http://jazz.net/xmlns/prod/jazz/rtc/cm/1.0/com.ibm.team.enterprise.promotion.linktype.resultWorkItem.promoted'))
		} else {
			this.id = rdflib.blankNode()
			this.kb = new rdflib.IndexedFormula()
		}
		this.etag = undefined
	}

	getURI() {
		return this.id.value;
	}
	
	/**
	 * Get a property of the resource. This method assumes any property could
	 * be multi-valued or undefined. Based on open-world assumptions, it is not
	 * considered an error to attempt to get a property that doesn't exist. This
	 * would simply return undefined.
	 *
	 * @param {string|symbol} property - the RDF property to get
	 * @returns - undefined, single object URL or literal value, or array of values
	 */
	get(property) {
		let p = (typeof property === 'string')? this.kb.sym(property): property
		let result = this.kb.each(this.id, p)
		if (result.length === 1) {
			return result[0].value
		} else if (result.length > 1) {
			return result.map((v) => v.value)
		} else {
			return null;
		}
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
	getIdentifier() {
		return this.get(DCTERMS('identifier'))
	}

	/**
	 * Get the resource dcterms:title
	 *
	 * @returns {string} - dcterms:title value
	 */
	getTitle() {
		var result = this.get(DCTERMS('title'))
		return Array.isArray(result)? result[0]: result
	}

	getShortTitle()	{
		return this.get(OSLC('shortTitle'));
	}

	/**
	 * Get the resource dcterms:description
	 *
	 * @returns {string} - dcterms:description value
	 */
	getDescription() {
		var result = this.get(DCTERMS('description'))
		return Array.isArray(result)? result[0]: result
	}

	/**
	 * Set the resource dcterms:title
	 *
	 * @param {string} value - dcterms:title value
	 */
	setTitle(value) {
		this.set(DCTERMS('title'), rdflib.literal(value))
	}

	/**
	 * Set the resource dcterms:description
	 *
	 * @param {string} value - dcterms:description value
	 */
	setDescription(value) {
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
	set(property, value) {
		// first remove the current values
		let p = (typeof property === 'string')? this.kb.sym(property): property
		var subject = this.id
		this.kb.remove(this.kb.statementsMatching(subject, p, undefined))
		if (typeof value == 'undefined') return
		if (Array.isArray(value)) {
			for (var i=0; i<value.length; i++) {
				this.kb.add(subject, p, value[i])
			}
		} else {
			this.kb.add(subject, p, value)
		}
	}

	/**
	 * Return an Array of link types (i.e. ObjectProperties) provided by this resource
	 */
	getLinkTypes() { 
		let linkTypes = new Set();
		let statements = this.kb.statementsMatching(this.id, undefined, undefined);
		for (let statement of statements) {
			if (statement.object instanceof rdflib.NamedNode) linkTypes.add(statement.predicate.value);
		}
		return linkTypes;		
	}


	/**
	 * Return an Array of name-value pairs for all properties of by this resource
	 */
	getProperties() { 
		let result = {};
		let statements = this.kb.statementsMatching(this.id, undefined, undefined);
		for (let statement of statements) {
			if (result[statement.predicate.value] != null) {
				if (!(result[statement.predicate.value] instanceof Array)) {
					result[statement.predicate.value] = [result[statement.predicate.value]]
				}
				result[statement.predicate.value].push(statement.object.value)
			} else {
				result[statement.predicate.value] = statement.object.value
			}
		}
		return result;		
	}

}

module.exports = OSLCResource;
