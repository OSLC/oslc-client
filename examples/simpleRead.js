/** This is simple example that demonstrates how to read any OSLC
  * resource without having to connect to a server and use a service provider
  */
'use strict';

var OSLCServer = require('../../oslc-client')
var OSLCResource = require('../OSLCResource')
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

server.read(resourceURI, function(err, result) {
	if (err) {
		console.error(` Could not read ${resourceURI}, got error: ${err}`);
		return;
	}
	console.log(`read resource: ${result.getTitle()}`)
	console.log(result.getLinkTypes())
	console.log(`tracksRequirement: ${result.get('http://open-services.net/ns/cm#tracksRequirement')}`)
})



