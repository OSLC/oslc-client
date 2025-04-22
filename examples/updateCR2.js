/** This is the same example as update CR.js, but using async/await
 * A simple example OSLC client application that demonstrates how to utilize
 * typical OSLC integration capabilities for doing CRUD operations on resource.
 * The example is based on the OSLC Workshop example at:
*/
'use strict';

var async = require('async');
var OSLCServer = require('..');
var OSLCResource = require('../OSLCResource');
require('../namespaces');



var args = process.argv.slice(2);
if (args.length != 5) {
	console.log("Usage: node updateCR.js serverURI projectArea workItemId userId password");
	process.exit(1);
}

// setup information - server, user, project area, work item to update
var serverURI = args[0];	    // Public URI of an RTC server
var serviceProvider = args[1];  // Project Area name containing the Work Item/Change Request to be changed
var changeRequestID = args[2];	// Work Item/Change Request id to change
var userId = args[3];		    // the user login name
var password = args[4];			// User's password

var server = new OSLCServer(serverURI, userId, password);

// Connect to the OSLC server, use a service provider container, and do some
// operations on resources. All operations are asynchronous but often have 
// to be done in a specific order. This example use async to control the order

console.log('Waiting for change request to update...')

// async.series executes a array of asynchronous functions in sequence. 
// Each function takes a callback(err, [result]) that must be called when the function completes.
// Since the callbacks for OSLCServer usually have the same signature,
// we can use the same callback for async.series callbacks directly.

var changeRequest = null // the change request we'll be updating

// connect to the server
await server.connect(OSLCCM10('cmServiceProviders'));
// use the service provider (a project area in this case)
await server.use(serviceProvider);

// delete a resource
err = await server.query({from: server.serviceProvider.queryBase(OSLCCM('ChangeRequest').uri), where: 'dcterms:title="deleteMe"'});
if (err) console.error("Cannot find resource deleteMe: ", err);
if (results && results.length > 0) {
	// delete the resource
	// there may be more than one, but we'll only delete one
	let resource = results[0]; // there may be more than one, but we'll only delete one
	console.log(`deleting: ${resource.getURI()}`)
	err = await server.delete(resource.getURI())
	if (err) console.error('Could not delete resource: '+err) {
		console.log('deleted resource deleteMe')
	}
} else {
	console.log('resource "deleteMe" not found')
}

// create a resource (this is what will be deleted on the next run)
var deleteMe = new OSLCResource()
deleteMe.setTitle('deleteMe')
deleteMe.setDescription('A test resource to delete')
deleteMe.set(RDF('type'), OSLCCM('ChangeRequest'))
err,result = await server.create('task', deleteMe);
if (err) {
	console.error('Could not create resource: '+err);
} else {
	console.log('Created: ' + result.id.uri);
}


// read a ChangeRequest resource by identifier
err, changeRequest = server.readById(OSLCCM('ChangeRequest').uri, changeRequestID);
if (err) {
	console.error('Could not read resource: '+err);
} else {
	changeRequest = result
	console.log('Got Change Request: '+changeRequest.get(DCTERMS('identifier')))
	console.log(changeRequest.get(DCTERMS('title')))
}


// update the ChangeRequest just read
// Just add the current date to the end of the description
var description = changeRequest.get(DCTERMS('description')) +  " - " + new Date()
changeRequest.set(DCTERMS('description'), description)
console.log('Updated resource description: '+changeRequest.getDescription())
err = await server.update(changeRequest);
if (err) {
	console.error('Could not update resource: '+err);
}

// all done
await server.disconnect()
console.log('Done')

