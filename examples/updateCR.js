/** This is the same example as update CR.js, but using async/await
 * A simple example OSLC client application that demonstrates how to utilize
 * typical OSLC integration capabilities for doing CRUD operations on resource.
 * The example is based on the OSLC Workshop example at:
*/
'use strict';

import OSLCClient from '../OSLCClient.js';
import OSLCResource from '../OSLCResource.js';
import { oslc_cm, rdf, dcterms } from '../namespaces.js';


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

var client = new OSLCClient(userId, password);

// Connect to the OSLC server, use a service provider container, and do some
// operations on resources. All operations are asynchronous but often have 
// to be done in a specific order. This example use async to control the order

console.log(`Creating, updating and deleting a ChangeRequest in ${serviceProvider}...`);

var changeRequest = null // the change request we'll be manipulating
var results = null // the results of OSLCClient request

// use the service provider (a project area in this case)
await client.use(serverURI, serviceProvider);

// delete a resource if it exists (possibly from a previous run)
try {
	results =  await client.queryResources(oslc_cm('ChangeRequest'), {where: 'dcterms:title="deleteMe"'});
	if (results?.length > 0) {
		// found a resource with tigle deleteMe, delete the resource
		// there may be more than one, but we'll only delete one
		let resource = results[0]; 
		console.log(`deleting: ${resource.getURI()}`)
		try {
			results = await client.deleteResource(resource)
			console.log('deleted resource deleteMe')
		} catch (err) {
			console.error('Could not delete resource: '+err);
		}
	} else {
		console.log('resource "deleteMe" not found')
	}
} catch (err) {
	console.error("Cannot find resource deleteMe: ", err);
}

// create a resource (this is what will be deleted on the next run)
var deleteMe = new OSLCResource();
deleteMe.setTitle('deleteMe');
deleteMe.setDescription('A test resource to delete');
deleteMe.set(rdf('type'), oslc_cm('ChangeRequest'));
try {
	results = await client.createResource('task', deleteMe);
	console.log('Created: ' + results.getURI());
} catch (err) {
	console.error('Could not create resource: '+err);
}

// read an existing ChangeRequest resource by identifier
try {
	changeRequest = await client.queryResources(oslc_cm('ChangeRequest'), {select:'*', where:`dcterms:identifier="${changeRequestID}"`});
	if (changeRequest?.length > 0) {
		changeRequest = changeRequest[0]; 
		console.log('Got Change Request: '+changeRequest.getURI());
		console.log(changeRequest.get(dcterms('title')));
	} else {
		console.log('No Change Request found with identifier: '+changeRequestID);
		process.exit(1);
	}	

} catch (err) {
	console.error('Could not read resource: '+err);
}

// update the ChangeRequest just read
// Just add the current date to the end of the description
var description = changeRequest.get(dcterms('description')) +  " - " + new Date();
changeRequest.set(dcterms('description'), description);
console.log('Updated resource description: '+changeRequest.getDescription());
try {
	results = await client.putResource(changeRequest);
} catch (err) {
	console.error('Could not update resource: '+err);
}

// all done
console.log('Done');
