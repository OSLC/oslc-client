import OSLCClient from '../OSLCClient.js';

// process command line arguments
var args = process.argv.slice(2)
if (args.length !== 5) {
	console.log('Usage: node oslcReauestGet.js baseURI resourceURI projectAreaName userId password')
	process.exit(1)
}

// setup information
var baseURI = args[0];
var resourceURI = args[1]	// the resource to read
var projectArea = args[2];  // Project Area name containing the Work Item/Change Request to be changed
var userId = args[3]		// the user login name
var password = args[4]		// User's password


console.log('Initializing OSLC client...');
const client = new OSLCClient(userId, password);

try {
    console.log('Setting up the service provider...');
    await client.use(baseURI, projectArea, 'CM');
    console.log('✓ Service provider configured');
} catch (spError) {
    console.error('✗ Failed to setup service provider:');
    console.error(spError.message);
}

try {
    console.log('Fetching sample resource...');
    const resource = await client.getResource(resourceURI);
    console.log('✓ Resource retrieved successfully');
    console.log(resource.getTitle()); 
} catch (error) {
    console.error('✗ Failed to fetch resource:');
    console.error(error.message);
}

try {
    console.log("Executing sample query...");
    const queryResults = await client.query(
        'http://open-services.net/ns/cm#ChangeRequest',
        {select:'dcterms:title',
        where: 'dcterms:title="SWT Exception"'}
    );
    console.log("✓ Query executed successfully");
    console.log(queryResults.serialize());
} catch (queryError) {
    console.error("✗ Query failed:");
    console.error(queryError.message);
    if (queryError.response) {
        console.error("Status:", queryError.response.status);
    }
}

