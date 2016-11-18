/** This is the same example as 
 * A simple example OSLC client application that demonstrates how to utilize
 * typical OSLC integration capabilities for doing CRUD operations on an Architecture Management resource.
 */
 'use strict';

var async = require('async');

var OSLCServer = require('../../oslc-client');
// setup information - server, user, project area, work item to update
var serverURI = "https://oslclnx3.rtp.raleigh.ibm.com:9443/dm";	// Set the Public URI of your RTC server
var userName = "jamsden";		// the user login name or id
var password = "matjas3cha";	
var providerContainerName = "Low Flow Washer (Design Management)"; // Set the project area name where is located the Work Item/Change Request to be changed
var amrID = "7";	// Set the Architecture Management Resource # to change

var server = new OSLCServer(serverURI);

// Connect to the OSLC server, use a service provider container, and do some
// operations on resources. All operations are asynchronous but often have 
// to be done in a specific order.


console.log('Waiting for architecture management resource to update...');

// async.series executes a array of asynchronous functions in sequence. 
// Each function takes a callback(err, [result]) that must be called when the function completes.
// Since the callbacks for OSLCServer usually have the same signature,
// we can use the same callback for async.series callbacks directly.
//
// The functions can be defined inline if they do not need to be reused. Otherwise
// define them separately and pass a reference in the array.

var amr = null; // the change request we'll be updating

async.series([
	function connect(callback) {server.connect(userName, password, callback);},
	function use(callback) {server.use(providerContainerName, callback);},
	function read(callback) {
		server.read(amrID, function(err, result) {
			if (!err) {
				amr = result;
				console.log('Got Change Request: ')
				console.log(amr);
			}
			callback(err, amr);
		});
	},
	function update(callback) {
		amr.description = amr.description + new Date();
		server.update(amr, function (err) {
			if (!err) console.log('Updated: '+amr.id);			
			callback(err);
		});
	},
	function cleanup(callback) {
		server.disconnect();
		console.log('Done');
		callback(null);
	}
]);
