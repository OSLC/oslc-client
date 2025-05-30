/*
 * Copyright 2014 IBM Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as $rdf from 'rdflib';
import { dcterms, oslc } from './namespaces.js';


/** This is a generic OSLC resource. Properties for
 * a particular domain resource will be added dynamically
 * when it is read. This allows OSLCResource to be used
 * on any domain without change or extension.
 *
 * However, subclasses may be created for any OSLC domain
 * as a convenience for those domain resources.
 * 
 * OSLCResource is a class wrapper on an rdflib Store. 
 * Some common OSLC properties are accessed directly through
 * accessor methods. Other properties are accessed through the 
 * get and set property methods through reflection.

 * @author Jim Amsden
 * @class
 * @parm {string} uri - the URI sym of this resource
 * @param {Store} kb - the Knowledge Base that contains the resource RDF graph
 */
export default class OSLCResource {
  constructor(uri=null, store=null, etag=null) {
    if (uri) {
      this.queryURI = uri;
      const resourceURI = new URL(uri);
      this.uri = $rdf.sym(resourceURI.origin + resourceURI.pathname);
      this.store = store;
      this.etag = etag;
    } else {
      // construct an empty resource
      this.uri = $rdf.blankNode();
      this.store = $rdf.graph();
      this.etag = undefined;
    }
  }

  getURI() {
    return this.uri.value;
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
    let p = typeof property === 'string' ? this.store.sym(property) : property;
    let result = this.store.each(this.uri, p);
    if (result.length === 1) {
      return result[0].value;
    } else if (result.length > 1) {
      return result.map((v) => v.value);
    } else {
      return undefined;
    }
  }

  /**
   * The following accessor functions are for common OSLC core vocabulary
   * that most OSLC resources are likely to have. Subclasses for OSLC domain
   * vocabularies would likely add additional accessor methods for the
   * properties defined in their domain specification.
   */

  /**
   * Get the resource dcterms:identifier
   *
   * @returns {string} - dcterms:identifier value
   */
  getIdentifier() {
    return this.get(dcterms('identifier'));
  }

  /**
   * Get the resource dcterms:title
   *
   * @returns {string} - dcterms:title value(s)
   */
  getTitle() {
    var result = this.get(dcterms('title'));
    return Array.isArray(result) ? result[0] : result;
  }

  getShortTitle() {
    return this.get(oslc('shortTitle'));
  }

  /**
   * Get the resource dcterms:description
   *
   * @returns {string} - dcterms:description value
   */
  getDescription() {
    var result = this.get(dcterms('description'));
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Set the resource dcterms:title
   *
   * @param {string} value - dcterms:title value
   */
  setTitle(value) {
    this.set(dcterms('title'), $rdf.literal(value));
  }

  /**
   * Set the resource dcterms:description
   *
   * @param {string} value - dcterms:description value
   */
  setDescription(value) {
    this.set(dcterms('description'), $rdf.literal(value));
  }

  /**
   * Set a property of the resource. This method assumes any property could
   * be multi-valued or undefined. Based on open-world assumptions, it is not
   * considered an error to attempt to set a property that doesn't exist. So
   * set can be used to add new properties. Using undefined for the value will
   * remove the property.
   * 
   * If the property is multi-valued, the caller should include all the desired
   * values since the property will be completely replaced with the new value.
   *
   * @param {string} property - the RDF property to set
   * @param {Node} value - the new value, all old values will be removed
   * @returns {void}
   */
  set(property, value) {
    // first remove the current values
    let p = typeof property === 'string' ? this.store.sym(property) : property;
    var subject = this.uri;
    this.store.remove(this.store.statementsMatching(subject, p, undefined));
    if (typeof value == 'undefined') return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        this.store.add(subject, p, value[i]);
      }
    } else {
      this.store.add(subject, p, value);
    }
  }

  /**
   * Return an Set of link types (i.e. ObjectProperties) provided by this resource
   */
  getLinkTypes() {
    let linkTypes = new Set();
    let statements = this.store.statementsMatching(this.uri, undefined, undefined);
    for (let statement of statements) {
      if (statement.object instanceof $rdf.NamedNode)
        linkTypes.add(statement.predicate.value);
    }
    return linkTypes;
  }

  /**
   * Return an Array of name-value pairs for all properties of by this resource
   */
  getProperties() {
    let result = {};
    let statements = this.store.statementsMatching(this.uri, undefined, undefined);
    for (let statement of statements) {
      if (result[statement.predicate.value] != null) {
        if (!(result[statement.predicate.value] instanceof Array)) {
          result[statement.predicate.value] = [
            result[statement.predicate.value],
          ];
        }
        result[statement.predicate.value].push(statement.object.value);
      } else {
        result[statement.predicate.value] = statement.object.value;
      }
    }
    return result;
  }
}


