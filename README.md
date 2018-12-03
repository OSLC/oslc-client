# oslc-client

[![Discourse status](https://img.shields.io/discourse/https/meta.discourse.org/status.svg)](https://forum.open-services.net/)
[![Gitter](https://img.shields.io/gitter/room/nwjs/nw.js.svg)](https://gitter.im/OSLC/chat)

An OSLC client API Node.js module

oslc-client is a JavaScript Node.js module supporting OSLC client and server development. The client API exposes the OSLC core and domain capabilities through a simple JavaScript API on the OSLC REST services. 

oslc-client exploits the dynamic and asynchronous capabilities of JavaScript and Node.js to build and API that can easily adapt to any OSLC domain, extensions to domains, and/or integrations between domains. 

This implementation makes use of typical jazz.net application extensions and OSLC usage conventions such as:

## Usage

To use oslc-client, include a dependency in your OSLC client app's package.json file:

```
  "dependencies": {
    "oslc-client": "~1.0.0",
    "async": "^2.6.0"
  }
```
* Servers are identified by a server root URL that is typically https://host:port/domain. For example, https://acme.com/ccm would be the server URL for an instance of RTC.
* Servers provide a rootservices resource at their server root URL that can be used to discover the discovery services provided by the server. This typically provides the URLs to the service provider catalogs and TRS providers. For example https://acme.com/ccm/rootservices provides this information for an instance of RTC. By convention, access to the rootservices resource does not require authentication. This is to provide the OAuth URLs often needed to do authentication.
* Authentication is done through extensions to request.js that automatically use jazz FORM based authentication by POSTing user credentials to serverURI/j_security_check in response to an authentication challenge indicated by header x-com-ibm-team-repository-web-auth-msg=authrequired
* Resources are often identified by their dcterms:identifier property, and a readById function is provided to conveniently query resources by ID.

# examples

See examples/updateCR.js for an example client application that connects to a server, uses a particular service provider, queries, creates, reads, updates, and deletes ChangeRequest resources managed by RTC.

## Contributors

Contributors:

* Jim Amsden (IBM)

## License

Licensed under the [Apache License Version 2.0](./LICENSE.txt).

