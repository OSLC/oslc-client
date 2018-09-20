/** This is the same example as 
 * A simple example OSLC client application that demonstrates how to utilize
 * typical OSLC integration capabilities for doing CRUD operations on resource.
 * The example is based on the OSLC Workshop example at:
 * /Users/jamsden/Documents/workspace/net.jazz.oslc.consumer.oslc4j.cm.client
 * Example04.java, but in JavaScript and using Node.js and a prototype of oslc.js
  */
'use strict';

var async = require('async');
var OSLCServer = require('../../oslc-client');
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

async.series([
	// connect to the server
	(callback) => server.connect(OSLCCM10('cmServiceProviders'), callback),

	// use the service provider (a project area in this case)
	(callback) => server.use(serviceProvider, callback),

	// delete a resource
	(callback) => {
		server.query({from: server.serviceProvider.queryBase(OSLCCM('ChangeRequest').uri), where: 'dcterms:title="deleteMe"'}, function(err, results) {
			if (err) console.error("Cannot find resource deleteMe: ", err)
			if (results) {
				let resource = results[0]; // there may be more than one, but we'll on ly delete one
				console.log(`deleting: ${resource.getURI()}`)
				server.delete(resource.getURI(), function(err) {
					if (err) console.error('Could not delete resource: '+err)
					console.log('deleted resource deleteMe')
				})
			} else {
				console.log('resource "deleteMe" not found')
			}
			callback(err)
		})
	},

	// create a resource (this is what will be deleted on the next run)
	(callback) => {
		var deleteMe = new OSLCResource()
		deleteMe.setTitle('deleteMe')
		deleteMe.setDescription('A test resource to delete')
		deleteMe.set(RDF('type'), OSLCCM('ChangeRequest'))
		server.create('task', deleteMe, function(err, result) {
			console.log('Created: ' + result.id.uri)
			callback(err)
		})
	},

	// read a ChangeRequest resource by identifier
	(callback) => {
		server.readById(OSLCCM('ChangeRequest').uri, changeRequestID, function(err, result) {
			if (!err) {
				changeRequest = result
				console.log('Got Change Request: '+changeRequest.get(DCTERMS('identifier')))
				console.log(changeRequest.get(DCTERMS('title')))
			}
			callback(err, changeRequest)
		})
	},

	// update the ChangeRequest just read
	(callback) => {
		// Just add the current date to the end of the description
		var description = changeRequest.get(DCTERMS('description')) +  " - " + new Date()
		changeRequest.set(DCTERMS('description'), description)
		console.log('Updated resource description: '+changeRequest.getDescription())
		server.update(changeRequest, function (err) {
			callback(err)
		})
	},

	// all done
	(callback) => {
		server.disconnect()
		console.log('Done')
		callback(null)
	}
])
