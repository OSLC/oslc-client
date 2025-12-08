/** This is simple example that demonstrates how to read any OSLC
  * resource without having to connect to a server and use a service provider
  */
'use strict';

import OSLCClient from '../OSLCClient.js';
import { oslc_cm } from '../namespaces.js';

// process command line arguments
var args = process.argv.slice(2)
if (args.length !== 3) {
	console.log("Usage: node simpleCMRead.js baseURL resourceURI userId password")
	process.exit(1)
}

// setup information
var resourceURI = args[0];	// the resource to read
var userId = args[1]		// the user login name
var password = args[2]		// User's password

var client = new OSLCClient(userId, password, 'https://elmdemo.smartfacts.com:9443/gc/configuration/44283'); // there server will be unknown in this case

console.log(`reading: ${resourceURI}`)

// Oddly DOORS Next can handle multiple oslc.prefix query parameters, but not a single one with multiple prefixes.
var reqImplementsReqSelectedProps = resourceURI + '?oslc.prefix=dcterms=<http://purl.org/dc/terms/>&oslc.prefix=oslc_cm=<http://open-services.net/ns/cm%23>';
// You need to manually escape the # in the oslc.prefix URIs
reqImplementsReqSelectedProps = reqImplementsReqSelectedProps + '&oslc.properties=dcterms:title';

let result = null;
try {
	result = await client.getResource(resourceURI);
	console.log(`read resource: ${result.getTitle()}`)
	console.log("Resource available link types:")
	console.log(result.getLinkTypes())
	console.log(`tracksRequirement: ${result.get('http://open-services.net/ns/config#component')}`)

	// show all the properties:
	console.log(`\nAll properties of ${result.getShortTitle()}:`)
	let props = result.getProperties()
	for (let prop in props) {
		console.log(`\t${prop}: ${props[prop]}`)
	}
} catch (err) {
	console.error(` Could not read ${resourceURI}, got error: ${err}`);
}

// now read the compact resource representation
try {
	result = await client.getCompactResource(resourceURI);
	console.log(`read compact resource: ${result.getShortTitle()}, ${result.getTitle()}`)
	let smallPreview = result.getSmallPreview();
	console.log(`smallPreview: ${smallPreview.document}, ${smallPreview.hintHeight}, ${smallPreview.hintWidth}`);
} catch (err) {
	console.error(` Could not read ${resourceURI}, got error: ${err}`);
}

// now read using selective properties to get some preview information of the trackedRequirements
try {
	result = await client.getResource(reqImplementsReqSelectedProps);
	// TODO: selected properties needs additional work
	console.log(`\n\nSelected properties of: ${result.getURI()}`)
	let props = result.getProperties()
	for (let prop in props) {
		console.log(`\t${prop}: ${props[prop]}`)
	}
} catch (err) {
	console.error(` Could not read ${reqImplementsReqSelectedProps}, got error: ${err}`);
}



