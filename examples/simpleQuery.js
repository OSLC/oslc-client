/** This is simple example that demonstrates how to do simple OSLC queryies
  * without having to connect to a server and use a service provider
  */
'use strict';

var OSLCServer = require('../../oslc-client')
var OSLCResource = require('../OSLCResource')
require('../namespaces')

// process command line arguments
var args = process.argv.slice(2)
if (args.length != 4) {
	console.log("Usage: node simpleQuery.js workItemID queryBase userId password")
	process.exit(1)
}

// setup information
var workItemId = args[0];   // an RTC work item ID (dcterms:identifier)
var queryBase = args[1]	    // the queryBase URI from the ServiceProvider
var userId = args[2]		// the user login name
var password = args[3]		// User's password

var server = new OSLCServer(undefined, userId, password); // there server will be unknown in this case

console.log(`querying: ${workItemId} using ${userId} and ${password}`)


let sampleQuery = {
	select: 'dcterms:identifier,oslc:shortTitle,dcterms:title',
	from: queryBase,
	where: `dcterms:identifier=${workItemId}`,
};

server.query(sampleQuery, (err, results) => {
	if (err) {
		console.error(` Could not execute query, got error: ${err}`);
		return;
	}
	console.log('Query returned:');
	for (let resource of results) {
		console.log(`${resource.getIdentifier()}: ${resource.get(OSLC('shortTitle'))}: ${resource.getTitle()}`);
	}
});



