/** This is simple example that demonstrates how to do simple OSLC queryies
  * without having to connect to a server and use a service provider
  */
import OSLCClient from '../OSLCClient.js';
import { oslc_cm } from '../namespaces.js';

// process command line arguments
var args = process.argv.slice(2)
if (args.length != 5) {
	console.log("Usage: node simpleQuery.js baseURL projectAreaName workItemID userId password")
	process.exit(1)
}

// setup information
var baseURL = args[0]	    // required for authentication
var projectArea = args[1]	    // the queryBase URI from the ServiceProvider
var workItemId = args[2];   // an RTC work item ID (dcterms:identifier)
var userId = args[3]		// the user login name
var password = args[4]		// User's password

const client = new OSLCClient(userId, password);

console.log(`querying: ${workItemId} in ${projectArea}`)

const sampleQuery = {
	prefix: null,
	select: 'dcterms:identifier,oslc:shortTitle,dcterms:title',
	where: `dcterms:identifier=${workItemId}`
}

try {
    await client.use(baseURL, projectArea, 'CM');
	const resources = await client.queryResources(oslc_cm('ChangeRequest'), sampleQuery);
    console.log("✓ Query executed successfully");
	for (let resource of resources) {
		console.log(`Resource title: ${resource.getTitle()}`);
	}
} catch (error) {
	console.error(`✗ Failed to fetch resource: ${error.response?.status} ${error.message}`);
	console.error(error.stack);
};



