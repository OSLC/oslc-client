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

import { oslc } from './namespaces.js';
import OSLCResource from './OSLCResource.js';


/** Implements OSLC Copact resource to support OSLC Resource Preview
 * @class
 *
 * @constructor
 * @param {string} uri - the URI of the Jazz rootservices resource
 * @param {Store} store - the RDF Knowledge Base for this rootservices resource
*/
export default class Compact extends OSLCResource {

	constructor(uri, store) {
		super(uri, store);
	}

	getShortTitle()	{
		return this.get(oslc('shortTitle'));
	}

	getIcon()	{
		return this.get(oslc('icon'));
	}

	getIconTitle()	{
		return this.get(oslc('iconTitle'));
	}

	getIconSrcSet()	{
		return this.get(oslc('iconSrcSet'));
	}

	getSmallPreview()	{
		let preview = this.store.the(this.uri, oslc('smallPreview'));
		if (!preview) return null;
		let hintHeight = this.store.the(preview, oslc('hintHeight'));
		let hintWidth = this.store.the(preview, oslc('hintWidth'));
		return {
			document: this.store.the(preview, oslc('document')).value,
			hintHeight: hintHeight? hintHeight.value: undefined,
			hintWidth: hintWidth? hintWidth.value: undefined
		}
	}

	getLargePreview()	{
		let preview = this.store.the(this.uri, oslc('largePreview'));
		if (!preview) return null;
		let hintHeight = this.store.the(preview, oslc('hintHeight'));
		let hintWidth = this.store.the(preview, oslc('hintWidth'));
		return {
			document: this.store.the(preview, oslc('document')).value,
			hintHeight: hintHeight? hintHeight.value: undefined,
			hintWidth: hintWidth? hintWidth.value: undefined
		}
	}
}

