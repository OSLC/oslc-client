// This is the same example as 
// A simple example OSLC client application that demonstrates how to utilize
// typical OSLC integration capabilities for doing CRUD operations on resource.
// The example is based on the OSLC Workshop example at:
// /Users/jamsden/Documents/workspace/net.jazz.oslc.consumer.oslc4j.cm.client
// Example04.java, but in JavaScript and using Node.js and a prototype of oslc.js

var async = require('async');

var OSLCServer = require('../../oslc-client');

// setup information - server, user, project area, work item to update
var serverURI = "https://oslclnx2.rtp.raleigh.ibm.com:9443/ccm";	// Set the Public URI of your RTC server
var userName = "jamsden";		// the user login name or id
var password = "********";	
var providerContainerName = "JKE Banking (Change Management)"; // Set the project area name where is located the Work Item/Change Request to be changed
var changeRequestID = "7";	// Set the Work Item/Change Request # to change

var server = new OSLCServer(serverURI);

// Connect to the OSLC server, use a service provider container, and do some
// operations on resources. All operations are asynchronous but often have 
// to be done in a specific order.


console.log('Waiting for change request to update...');

// async.series executes a array of asynchronous functions in sequence. 
// Each function takes a callback(err, [result]) that must be called when the function completes.
// Since the callbacks for OSLCServer usually have the same signature,
// we can use the same callback for async.series callbacks directly.
//
// The functions can be defined inline if they do not need to be reused. Otherwise
// define them separately and pass a reference in the array.

var changeRequest = null; // the change request we'll be updating

async.series([
	function connect(callback) {server.connect(userName, password, callback);},
	function use(callback) {server.use(providerContainerName, callback);},
	function read(callback) {
		server.read(changeRequestID, function(err, result) {
			if (!err) {
				changeRequest = result;
				console.log('Got Change Request: ')
				console.log(changeRequest);
			}
			callback(err, changeRequest);
		});
	},
	function update(callback) {
		changeRequest.description = changeRequest.description + new Date();
		server.update(changeRequest, function (err) {
			if (!err) console.log('Updated: '+changeRequest.id);			
			callback(err);
		});
	},
	function cleanup(callback) {
		server.disconnect();
		console.log('Done');
		callback(null);
	}
]);
