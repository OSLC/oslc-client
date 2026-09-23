import { jest } from '@jest/globals';
import OSLCClient from '../OSLCClient.js';

/**
 * Rhapsody Systems Engineering serves its OSLC resource shape as RDF/XML but labels it
 * `application/xml` (elm-compatibility quirk 44). Before 4.2.1 that landed in the plain-XML
 * branch, which called DOMParser.parseFromString with the media type omitted — throwing in a
 * browser, where the argument is required. Resource Navigator caught the throw, cached an empty
 * shape document, and silently lost link navigation for every Rhapsody element (quirk 50).
 *
 * The rule the fix encodes: resolve the ambiguity by what the CALL negotiated, never by sniffing
 * the body. `application/xml` is a supertype of `application/rdf+xml`, so a caller that asked for
 * RDF and got the supertype meant RDF; a caller that asked for XML still gets XML.
 */

const RSE_SHAPE_RDFXML = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:oslc="http://open-services.net/ns/core#"
         xmlns:dcterms="http://purl.org/dc/terms/">
  <oslc:ResourceShape rdf:about="https://rse.example/shape/resource">
    <dcterms:title>Architecture Management Resource</dcterms:title>
    <oslc:property>
      <oslc:Property>
        <oslc:name>satisfies</oslc:name>
        <oslc:propertyDefinition rdf:resource="http://jazz.net/ns/dm/linktypes#satisfy"/>
        <oslc:valueType rdf:resource="http://open-services.net/ns/core#Resource"/>
        <oslc:occurs rdf:resource="http://open-services.net/ns/core#Zero-or-many"/>
      </oslc:Property>
    </oslc:property>
  </oslc:ResourceShape>
</rdf:RDF>`;

async function clientReturning(body, contentType) {
  const client = new OSLCClient('u', 'p');
  // Run the real initialisation first: it is what loads DOMParser (and it replaces
  // this.client with the cookie-jar wrapper), so stubbing it out removes the very
  // thing under test. The _initialized guard makes getResource's own call a no-op,
  // so the stub below survives.
  await client._ensureInitialized();
  client.client = {
    get: async () => ({
      status: 200,
      headers: { 'content-type': contentType, etag: 'W/"1"' },
      data: body,
    }),
  };
  return client;
}

describe('application/xml carrying RDF/XML', () => {
  it('parses as RDF when the call negotiated RDF — the Rhapsody shape case', async () => {
    const client = await clientReturning(RSE_SHAPE_RDFXML, 'application/xml');

    // Default accept is application/rdf+xml, which is what every shape fetch uses.
    const resource = await client.getResource('https://rse.example/shape/resource');

    // Before 4.2.1 this threw: parseFromString called without a media type.
    expect(resource.store).toBeTruthy();
    expect(resource.store.statements.length).toBeGreaterThan(0);

    // And the graph is the shape, not an opaque document — the property that made
    // Resource Navigator classify satisfy as a link is present and reachable.
    const valueTypes = resource.store
      .statementsMatching(null, resource.store.sym('http://open-services.net/ns/core#valueType'), null)
      .map(s => s.object.value);
    expect(valueTypes).toContain('http://open-services.net/ns/core#Resource');

    const propDefs = resource.store
      .statementsMatching(null, resource.store.sym('http://open-services.net/ns/core#propertyDefinition'), null)
      .map(s => s.object.value);
    expect(propDefs).toContain('http://jazz.net/ns/dm/linktypes#satisfy');
  });

  it('still returns XML when the call negotiated XML, so an XML caller is not handed a graph', async () => {
    const client = await clientReturning('<process><name>plain</name></process>', 'application/xml');

    const result = await client.getResource('https://elm.example/process', '2.0', 'application/xml');

    expect(result.xml).toBeTruthy();
    expect(result.store).toBeUndefined();
  });
});
