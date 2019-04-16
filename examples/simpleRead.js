/** This is simple example that demonstrates how to read any OSLC
  * resource without having to connect to a server and use a service provider
  */
'use strict';

var OSLCServer = require('../../oslc-client')
var OSLCResource = require('../OSLCResource')
var URI = require('urijs');
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

//var reqImplementsReqSelectedProps = resourceURI + '?oslc.prefix=oslc=<http://open-services.net/ns/core%23>,oslc_cm=<http://open-services.net/ns/cm%23>,dcterms=<http://purl.org/dc/terms/>';
var reqImplementsReqSelectedProps = resourceURI + '?oslc.properties=oslc_cm:implementsRequirement';
// You need to escape the <> in the oslc.prefix URIs
reqImplementsReqSelectedProps = reqImplementsReqSelectedProps + '&oslc.prefix=oslc_cm=%3Chttp://open-services.net/ns/cm%23%3E,dcterms=%3Chttp://purl.org/dc/terms/%3E';

server.read(resourceURI, function(err, result) {
	if (err) {
		console.error(` Could not read ${resourceURI}, got error: ${err}`);
		return;
	}
	console.log(`read resource: ${result.getTitle()}`)
	console.log("Resource available link types:")
	console.log(result.getLinkTypes())
	console.log(`tracksRequirement: ${result.get('http://open-services.net/ns/cm#tracksRequirement')}`)

	// show all the properties:
	console.log(`\nAll properties of ${result.getShortTitle()}:`)
	let props = result.getProperties()
	for (let prop in props) {
		console.log(`\t${prop}: ${props[prop]}`)
	}

	// now read the compact resource representation
	server.readCompact(resourceURI, function(err, result) {
		if (err) {
			console.error(` Could not read ${resourceURI}, got error: ${err}`);
			return;
		}
		console.log(`read compact resource: ${result.getIdentifier()}, ${result.getShortTitle()}, ${result.getTitle()}`)
		let smallPreview = result.getSmallPreview();
		console.log(`smallPreview: ${smallPreview.document}, ${smallPreview.hintHeight}, ${smallPreview.hintWidth}`);

		// now read using selective properties to get some preview information of the trackedRequirements
		server.read(reqImplementsReqSelectedProps, function(err, result) {
			if (err) {
				console.error(` Could not read ${reqImplementsReqSelectedProps}, got error: ${err}`);
				return;
			}

			// TODO: selected properties needs additional work
			console.log(`\n\nSelected properties of: ${result.getURI()}`)
			let props = result.getProperties()
			for (let prop in props) {
				console.log(`\t${prop}: ${props[prop]}`)
			}
		})
	})	
})



