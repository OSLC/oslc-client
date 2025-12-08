# oslc-client

[![npm](https://img.shields.io/npm/v/oslc-client)](https://www.npmjs.com/package/oslc-client)
[![Discourse status](https://img.shields.io/discourse/https/meta.discourse.org/status.svg)](https://forum.open-services.net/)
[![Gitter](https://img.shields.io/gitter/room/nwjs/nw.js.svg)](https://gitter.im/OSLC/chat)

An OSLC client API Node.js module

oslc-client is a JavaScript Node.js module supporting OSLC client and server development. The client API exposes the OSLC 
core and domain capabilities through a simple JavaScript API on the OSLC REST services. 

oslc-client exploits the dynamic and asynchronous capabilities of JavaScript and Node.js to build and API that can easily 
adapt to any OSLC domain, extensions to domains, and/or integrations between domains. 

This version updates previous 2.x.x versions to use axios for HTTP access and modern JavaScript async/await to handle
asynchronous operations.

Version 3.0.1 is a maintenance release that alows oslc-client run in the browser or in a node.js environment.

* 

## Usage

To use oslc-client, include a dependency in your OSLC client app's package.json file:

```
  "dependencies": {
    "oslc-client": "~3.0.0",
  }
```
* Servers are identified by a server root URL that is typically https://host:port/domain. For example, https://acme.com/ccm would be the server URL for an instance of RTC.
* Servers provide a rootservices resource at their server root URL that can be used to discover the discovery services provided by the server. This typically provides the URLs to the service provider catalogs and TRS providers. For example https://acme.com/ccm/rootservices provides this information for an instance of RTC. By convention, access to the rootservices resource does not require authentication. This is to provide the OAuth URLs often needed to do authentication.
* Authentication is done through extensions to axios request interceptors that automatically use jazz FORM based authentication by POSTing user credentials to serverURI/j_security_check in response to an authentication challenge indicated by header x-com-ibm-team-repository-web-auth-msg=authrequired
* Resources are often identified by their dcterms:identifier property, and a readById function is provided to conveniently query resources by ID.

# examples

See examples/updateCR.js for an example client application that connects to a server, uses a particular service provider, queries, creates, reads, updates, and deletes ChangeRequest resources managed by RTC.

## Contributors

Contributors:

* Jim Amsden (IBM)

## License

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

