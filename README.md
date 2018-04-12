# oslc-client
An OSLC client API Node.js module

oslc-client is a JavaScript Node.js module supporting OSLC client and server development. The client API exposes the OSLC core and domain capabilities through a simple JavaScript API on the OSLC REST services. The same API may also represent an abstract implementation of a server supporting OSLC core capabilities and domains. See oslc-server for an implementation of the OSLC REST services that delegate to this API which can then be adapted to existing data sources, services and OSLC domains.

oslc-client exploits the dynamic and asynchronous capabilities of JavaScript and Node.js to build and API that can easily adapt to any OSLC domain, extensions to domains, and/or integrations between domains. 

This implementation makes use of typical jazz.net application extensions and OSLC usage conventions such as:

* Servers are identified by a server root URL that is typically https://host:port/domain. For example, https://ce4iot.rtp.raleigh.ibm.com/ccm would be the server root URL for an instance of RTC.
* Servers provide a rootservices resource at their server root URL that can be used to discover the discovery services provided by the server. This typically provides the URLs to the service provider catalogs and TRS providers. For example https://ce4iot.rtp.raleigh.ibm.com/ccm/rootservices provides this information for and instance of RTC. By convention, access to the rootservices resource does not require authentication. This is to provide the OAuth URLs often needed to do authentication.
* Resources are often identified by their dcterms:identifier property, and a readById function is provided to conveniently query resources by ID.

