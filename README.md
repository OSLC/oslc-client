# oslc-client

[![npm](https://img.shields.io/npm/v/oslc-client)](https://www.npmjs.com/package/oslc-client)
[![Discourse status](https://img.shields.io/discourse/https/meta.discourse.org/status.svg)](https://forum.open-services.net/)
[![Gitter](https://img.shields.io/gitter/room/nwjs/nw.js.svg)](https://gitter.im/OSLC/chat)

A JavaScript library for consuming OSLC 3.0 servers. Uses [axios](https://github.com/axios/axios) for HTTP, [rdflib](https://github.com/linkeddata/rdflib.js) for RDF parsing, and supports Basic, JEE Form, and JAS Bearer token authentication. Works in both Node.js and browser environments.

## Install

```bash
npm install oslc-client
```

Or, from a workspace monorepo, add a file dependency in your `package.json`:

```json
{
  "dependencies": {
    "oslc-client": "file:../oslc-client"
  }
}
```

## Quick Start

```js
import OSLCClient from 'oslc-client';

const client = new OSLCClient('user', 'password');

// Connect to a server and select a service provider
await client.use('https://example.com/ccm', 'My Project', 'CM');

// Fetch a resource by URL
const resource = await client.getResource('https://example.com/ccm/resource/1');

console.log(resource.getTitle());
console.log(resource.getIdentifier());
console.log(resource.getDescription());

// Read any RDF property
const modified = resource.get('http://purl.org/dc/terms/modified');

// Update and save
resource.setTitle('Updated title');
await client.putResource(resource, resource.etag);

// Delete
await client.deleteResource(resource);
```

## API

### OSLCClient

```js
import OSLCClient from 'oslc-client';
```

#### `new OSLCClient(user, password, configurationContext?)`

Creates a client instance. An axios HTTP client is configured internally with cookie jar support (Node.js) or `withCredentials` (browser). If `configurationContext` is provided, a `Configuration-Context` header is sent with every request.

#### `client.use(serverUrl, serviceProviderName, domain?)`

Connects to an OSLC server, reads its `rootservices` document, discovers the `ServiceProviderCatalog` for the given domain (`'CM'`, `'RM'`, or `'QM'`; defaults to `'CM'`), and selects the named service provider. Must be called before `createResource`, `queryResources`, or `query`.

#### `client.getResource(url, oslcVersion?, accept?)`

Fetches an OSLC resource and returns an `OSLCResource`. The response body is parsed into an rdflib graph. Defaults to OSLC version `'2.0'` and `Accept: application/rdf+xml`.

For non-RDF content types (`text/xml`, `application/xml`), returns `{ etag, xml }`. For Atom feeds, returns `{ etag, feed }`.

#### `client.getCompactResource(url, oslcVersion?, accept?)`

Fetches an OSLC Compact (UI Preview) resource. Returns a `Compact` object with `getTitle()` and `getShortTitle()` accessors. Defaults to `Accept: application/x-oslc-compact+xml`.

#### `client.putResource(resource, eTag?, oslcVersion?)`

Serializes the resource's RDF graph to `application/rdf+xml` and PUTs it back to the server. Pass the resource's `etag` to enable optimistic concurrency via `If-Match`.

#### `client.createResource(resourceType, resource, oslcVersion?)`

Creates a new resource using the creation factory discovered from the current service provider. `resourceType` is the OSLC resource type URI. Returns the newly created `OSLCResource` (fetched from the `Location` header).

#### `client.deleteResource(resource, oslcVersion?)`

Deletes the resource at its URI.

#### `client.queryResources(resourceType, query)`

Queries for resources of the given type and returns an array of `OSLCResource` objects. The `query` object supports `prefix`, `select`, `where`, and `orderBy` properties corresponding to the OSLC query parameters. Handles paged results automatically.

#### `client.query(resourceType, query)`

Like `queryResources`, but returns the raw rdflib graph (store) instead of individual `OSLCResource` instances.

#### `client.client`

The underlying axios instance. Use this for direct HTTP requests when the higher-level API is insufficient.

---

### OSLCResource

```js
import OSLCResource from 'oslc-client/OSLCResource.js';
```

An RDF resource backed by an rdflib `IndexedFormula` (graph store). All OSLC properties are accessible through the generic `get`/`set` methods, with convenience accessors for common Dublin Core and OSLC Core properties.

#### `new OSLCResource(uri?, store?, etag?)`

Creates a resource. When called with no arguments, creates a blank node with an empty graph.

#### `resource.getURI()`

Returns the resource URI as a string.

#### `resource.store`

The rdflib `IndexedFormula` containing the resource's RDF statements.

#### `resource.etag`

The HTTP ETag from the server response, used for optimistic concurrency on updates.

#### `resource.get(property)`

Returns the value(s) of an RDF property. `property` can be a URI string or an rdflib `NamedNode`. Returns `undefined` if not present, a single string value if one triple matches, or an array of strings if multiple triples match.

#### `resource.set(property, value)`

Sets an RDF property, replacing all existing values. Pass `undefined` to remove the property. Pass an array to set multiple values.

#### `resource.getTitle()` / `resource.setTitle(value)`

Get or set `dcterms:title`.

#### `resource.getDescription()` / `resource.setDescription(value)`

Get or set `dcterms:description`.

#### `resource.getIdentifier()`

Get `dcterms:identifier`.

#### `resource.getShortTitle()`

Get `oslc:shortTitle`.

#### `resource.getProperties()`

Returns a plain object mapping predicate URIs to their values (string or array of strings) for all statements about this resource.

#### `resource.getLinkTypes()`

Returns a `Set` of predicate URIs where the object is a `NamedNode` (i.e., outgoing links).

#### `resource.getOutgoingLinks(linkTypes?)`

Returns an array of `{ sourceURL, linkType, targetURL }` objects for outgoing links. Optionally filter by a `Set` or `Array` of link type URIs.

## Authentication

The client handles authentication transparently via an axios response interceptor. Three mechanisms are supported, tried in order when a server issues a challenge:

1. **JEE Form authentication** -- triggered by the `x-com-ibm-team-repository-web-auth-msg: authrequired` header. The client POSTs credentials to `j_security_check`.
2. **JAS Bearer token** -- triggered by a `WWW-Authenticate: jauth realm` header containing a `token_uri`. The client obtains a bearer token and retries the request.
3. **HTTP Basic authentication** -- fallback for any `401` response. The client retries with an `Authorization: Basic` header.

No additional configuration is needed; provide your credentials to the constructor and authentication is handled automatically.

## RDF Handling

All OSLC resources are parsed into rdflib `IndexedFormula` graphs. The client negotiates RDF content types with the server, preferring `application/rdf+xml` but also accepting Turtle and JSON-LD.

Properties are accessed via rdflib `NamedNode` symbols or URI strings. The `OSLCResource.get()` and `set()` methods abstract the underlying triple store, but you can also work directly with `resource.store` for advanced queries using rdflib's API.

## Contributors

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
