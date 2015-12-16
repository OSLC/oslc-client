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


/** This is a generic OSLC resource. Properties for
 * a particular domain resource will be added dynamically
 * when it is read. This allows the OSLC module to be used
 * on any domain without change or extension.
 * @author Jim Amsden
 * @class
 * @parm {string} id - the id of this resource, usually its URI
 */
function OSLCResource(id) {
	this.id = id;
}

module.exports = OSLCResource;