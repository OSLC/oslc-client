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
require('./namespaces')

var ServiceProvider = require('./ServiceProvider');
var OSLCResource = require('./OSLCResource')


/** Implements OSLC Copact resource to support OSLC Resource Preview
 * @class
 *
 * @constructor
 * @param {string} uri - the URI of the Jazz rootservices resource
 * @param {IndexedFormula} kb - the RDF Knowledge Base for this rootservices resource
*/
class Compact extends OSLCResource {

	constructor(uri, kb) {
		super(uri, kb);
	}

	getShortTitle()	{
		return this.get(OSLC('shortTitle'));
	}

	getIcon()	{
		return this.get(OSLC('icon'));
	}

	getIconTitle()	{
		return this.get(OSLC('iconTitle'));
	}

	getIconSrcSet()	{
		return this.get(OSLC('iconSrcSet'));
	}

	getSmallPreview()	{
		let preview = this.kb.the(this.id, OSLC('smallPreview'));
		if (!preview) return null;
		let hintHeight = this.kb.the(preview, OSLC('hintHeight'));
		let hintWidth = this.kb.the(preview, OSLC('hintWidth'));
		return {
			document: this.kb.the(preview, OSLC('document')).value,
			hintHeight: hintHeight? hintHeight.value: undefined,
			hintWidth: hintWidth? hintWidth.value: undefined
		}
	}

	getLargePreview()	{
		let preview = this.kb.the(this.id, OSLC('largePreview'));
		if (!preview) return null;
		let hintHeight = this.kb.the(preview, OSLC('hintHeight'));
		let hintWidth = this.kb.the(preview, OSLC('hintWidth'));
		return {
			document: this.kb.the(preview, OSLC('document')).value,
			hintHeight: hintHeight? hintHeight.value: undefined,
			hintWidth: hintWidth? hintWidth.value: undefined
		}
	}
}

module.exports = Compact;