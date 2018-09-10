/** This is simple example that demonstrates how to read any OSLC
  * resource without having to connect to a server and use a service provider
  */
'use strict';

var OSLCServer = require('../../oslc-client')
var OSLCResource = require('../OSLCResource')
var rdflib = require('rdflib')
require('../namespaces')

// process command line arguments
var args = process.argv.slice(2)
if (args.length != 3) {
	console.log("Usage: node simpleRead.js resourceURI userId password")
	process.exit(1)
}

// setup information
var resourceURI = args[0]	// the resource to read
var userId = args[1]		// the user login name
var password = args[2]		// User's password

var server = new OSLCServer(undefined, userId, password); // there server will be unknown in this case

console.log(`reading: ${resourceURI}`)

// async.series executes a array of asynchronous functions in sequence. 
// Each function takes a callback(err, [result]) that must be called when the function completes.
// Since the callbacks for OSLCServer usually have the same signature,
// we can use the same callback for async.series callbacks directly.
//
// The functions can be defined inline if they do not need to be reused. Otherwise
// define them separately and pass a reference in the array.

var changeRequest = null // the change request we'll be updating

server.read(resourceURI, function(err, result) {
	if (err) {
		console.error(` Could not read ${resourceURI}, got error: ${err}`);
		return;
	}
	console.log(`read resource: ${result.getTitle()}`)
})

