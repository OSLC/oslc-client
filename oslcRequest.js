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

/*
 * Provide a couple of useful extensions to request.js for OSLC
 * purposes. One is to handle an authenticaiton challenge on any
 * GET operation. The other is to provide some convenience functions
 * for handling cookies.
 */

var request = require('request');
var cookies = request.jar();
var URI = require('urijs');

/* 
 * Set the typical OSLC defaults
 */
request = request.defaults({
	headers: {
		'Accept': 'application/rdf+xml',  // reliably available RDF representation
		'OSLC-Core-Version': '2.0'
	},
	strictSSL: false,  		  // no need for certificates
	jar: cookies,                // use the cookie jar to save cookies
	followAllRedirects: true  // for FORM based authentication
})
request.cookies = cookies;
request.mode='no-cors';

/* 
 * Lookup a cookie in the cookie jar
 */
request.getCookie = function(key) {
	var cookies = this.cookies._jar.toJSON().cookies
	var value = null;
	for (var cookie in cookies) {
		if (cookies[cookie].key === key) {
			value = cookies[cookie].value
			break
		}
	}
	return value
}

/* 
 * Extend GET to respond to jazz.net app authentication requests
 * using JEE FORM based authentication
 */
request.authGet = function (options, callback) {
	var _self = this;
	let uri = new URI((typeof options === "string")? options: options.uri);
	let serverURI = uri.origin() + uri.path();
	request.get(options, function(error, response, body) {
		if (response &&  response.headers['x-com-ibm-team-repository-web-auth-msg'] === 'authrequired') {
			// JEE Form base authentication
			request.post(serverURI+'/j_security_check?j_username='+_self.userId+'&j_password='+_self.password, callback)
		} else if (response && response.headers['www-authenticate']) {
			// OpenIDConnect authentication (using Jazz Authentication Server)
			request.get(options, callback).auth(_self.userId, _self.password, false)
		} else {
			callback(error, response, body)
		}
	})
}

module.exports = request

