/**
 * Integration tests for rdflib functionality
 * These tests verify that rdflib operations work correctly with the OSLC client
 */

import * as $rdf from 'rdflib';
import { Namespace, sym } from 'rdflib';
import OSLCResource from '../OSLCResource.js';
import { dcterms, oslc, rdf } from '../namespaces.js';

describe('rdflib Integration Tests', () => {
  describe('Basic rdflib operations', () => {
    test('should create an empty graph', () => {
      const graph = $rdf.graph();
      expect(graph).toBeDefined();
      expect(graph.statements).toBeDefined();
      expect(graph.statements.length).toBe(0);
    });

    test('should create named nodes with sym', () => {
      const node = sym('http://example.com/resource');
      expect(node).toBeDefined();
      expect(node.value).toBe('http://example.com/resource');
    });

    test('should create literals', () => {
      const literal = $rdf.literal('test value');
      expect(literal).toBeDefined();
      expect(literal.value).toBe('test value');
    });

    test('should create blank nodes', () => {
      const blankNode = $rdf.blankNode();
      expect(blankNode).toBeDefined();
      expect(blankNode.value).toMatch(/^n[0-9]+$/);
    });

    test('should create namespaces', () => {
      const testNs = Namespace('http://example.com/ns#');
      expect(testNs).toBeDefined();
      const term = testNs('term');
      expect(term).toBeDefined();
      expect(term.value).toBe('http://example.com/ns#term');
    });

    test('should check for NamedNode instance', () => {
      const namedNode = sym('http://example.com/resource');
      expect(namedNode instanceof $rdf.NamedNode).toBe(true);
    });
  });

  describe('Graph operations', () => {
    test('should add statements to graph', () => {
      const graph = $rdf.graph();
      const subject = sym('http://example.com/resource');
      const predicate = dcterms('title');
      const object = $rdf.literal('Test Title');
      
      graph.add(subject, predicate, object);
      
      expect(graph.statements.length).toBe(1);
      expect(graph.statements[0].subject.value).toBe('http://example.com/resource');
      expect(graph.statements[0].object.value).toBe('Test Title');
    });

    test('should query statements from graph', () => {
      const graph = $rdf.graph();
      const subject = sym('http://example.com/resource');
      const predicate = dcterms('title');
      const object = $rdf.literal('Test Title');
      
      graph.add(subject, predicate, object);
      
      const results = graph.each(subject, predicate);
      expect(results).toBeDefined();
      expect(results.length).toBe(1);
      expect(results[0].value).toBe('Test Title');
    });

    test('should match statements in graph', () => {
      const graph = $rdf.graph();
      const subject = sym('http://example.com/resource');
      const predicate = dcterms('title');
      const object = $rdf.literal('Test Title');
      
      graph.add(subject, predicate, object);
      
      const statements = graph.statementsMatching(subject, predicate, undefined);
      expect(statements).toBeDefined();
      expect(statements.length).toBe(1);
      expect(statements[0].object.value).toBe('Test Title');
    });

    test('should remove statements from graph', () => {
      const graph = $rdf.graph();
      const subject = sym('http://example.com/resource');
      const predicate = dcterms('title');
      const object = $rdf.literal('Test Title');
      
      graph.add(subject, predicate, object);
      expect(graph.statements.length).toBe(1);
      
      const statements = graph.statementsMatching(subject, predicate, undefined);
      graph.remove(statements);
      
      expect(graph.statements.length).toBe(0);
    });

    test('should handle multiple values for same property', () => {
      const graph = $rdf.graph();
      const subject = sym('http://example.com/resource');
      const predicate = dcterms('creator');
      
      graph.add(subject, predicate, $rdf.literal('Creator 1'));
      graph.add(subject, predicate, $rdf.literal('Creator 2'));
      
      const results = graph.each(subject, predicate);
      expect(results.length).toBe(2);
      expect(results.map(r => r.value)).toContain('Creator 1');
      expect(results.map(r => r.value)).toContain('Creator 2');
    });
  });

  describe('RDF parsing', () => {
    test('should parse RDF/XML', () => {
      const rdfXml = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:dcterms="http://purl.org/dc/terms/">
  <rdf:Description rdf:about="http://example.com/resource1">
    <dcterms:title>Test Resource</dcterms:title>
    <dcterms:description>Test Description</dcterms:description>
  </rdf:Description>
</rdf:RDF>`;
      
      const graph = $rdf.graph();
      $rdf.parse(rdfXml, graph, 'http://example.com/', 'application/rdf+xml');
      
      const subject = sym('http://example.com/resource1');
      const title = graph.any(subject, dcterms('title'));
      
      expect(title).toBeDefined();
      expect(title.value).toBe('Test Resource');
    });

    test('should parse Turtle', () => {
      const turtle = `@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix : <http://example.com/> .

:resource1 dcterms:title "Test Resource" ;
           dcterms:description "Test Description" .`;
      
      const graph = $rdf.graph();
      $rdf.parse(turtle, graph, 'http://example.com/', 'text/turtle');
      
      const subject = sym('http://example.com/resource1');
      const title = graph.any(subject, dcterms('title'));
      
      expect(title).toBeDefined();
      expect(title.value).toBe('Test Resource');
    });

    test('should handle parsing errors gracefully', () => {
      const invalidRdf = 'This is not valid RDF';
      const graph = $rdf.graph();
      
      expect(() => {
        $rdf.parse(invalidRdf, graph, 'http://example.com/', 'application/rdf+xml');
      }).toThrow();
    });
  });

  describe('RDF serialization', () => {
    test('should serialize to RDF/XML', () => {
      const graph = $rdf.graph();
      const subject = sym('http://example.com/resource1');
      
      graph.add(subject, dcterms('title'), $rdf.literal('Test Resource'));
      graph.add(subject, dcterms('description'), $rdf.literal('Test Description'));
      
      const serialized = graph.serialize(null, 'application/rdf+xml');
      
      expect(serialized).toBeDefined();
      expect(typeof serialized).toBe('string');
      expect(serialized).toContain('Test Resource');
      expect(serialized).toContain('Test Description');
      expect(serialized).toContain('http://example.com/resource1');
    });

    test('should serialize to Turtle', () => {
      const graph = $rdf.graph();
      const subject = sym('http://example.com/resource1');
      
      graph.add(subject, dcterms('title'), $rdf.literal('Test Resource'));
      
      const serialized = graph.serialize(null, 'text/turtle');
      
      expect(serialized).toBeDefined();
      expect(typeof serialized).toBe('string');
      expect(serialized).toContain('Test Resource');
    });
  });

  describe('OSLCResource with rdflib', () => {
    test('should create OSLCResource with empty graph', () => {
      const resource = new OSLCResource();
      
      expect(resource).toBeDefined();
      expect(resource.store).toBeDefined();
      expect(resource.uri).toBeDefined();
    });

    test('should create OSLCResource with URI', () => {
      const graph = $rdf.graph();
      const uri = 'http://example.com/resource1';
      const resource = new OSLCResource(uri, graph);
      
      expect(resource.getURI()).toBe(uri);
      expect(resource.store).toBe(graph);
    });

    test('should set and get resource title', () => {
      const resource = new OSLCResource();
      
      resource.setTitle('Test Title');
      const title = resource.getTitle();
      
      expect(title).toBe('Test Title');
    });

    test('should set and get resource description', () => {
      const resource = new OSLCResource();
      
      resource.setDescription('Test Description');
      const description = resource.getDescription();
      
      expect(description).toBe('Test Description');
    });

    test('should get properties from resource', () => {
      const graph = $rdf.graph();
      const uri = 'http://example.com/resource1';
      const subject = sym(uri);
      
      graph.add(subject, dcterms('title'), $rdf.literal('Test Title'));
      graph.add(subject, dcterms('identifier'), $rdf.literal('ID123'));
      
      const resource = new OSLCResource(uri, graph);
      const properties = resource.getProperties();
      
      expect(properties).toBeDefined();
      expect(properties['http://purl.org/dc/terms/title']).toBe('Test Title');
      expect(properties['http://purl.org/dc/terms/identifier']).toBe('ID123');
    });

    test('should get link types from resource', () => {
      const graph = $rdf.graph();
      const uri = 'http://example.com/resource1';
      const subject = sym(uri);
      
      // Add a literal property (should not be in link types)
      graph.add(subject, dcterms('title'), $rdf.literal('Test Title'));
      
      // Add a link property (should be in link types)
      graph.add(subject, dcterms('creator'), sym('http://example.com/user1'));
      graph.add(subject, oslc('serviceProvider'), sym('http://example.com/sp'));
      
      const resource = new OSLCResource(uri, graph);
      const linkTypes = resource.getLinkTypes();
      
      expect(linkTypes).toBeDefined();
      expect(linkTypes.size).toBe(2);
      expect(linkTypes.has('http://purl.org/dc/terms/creator')).toBe(true);
      expect(linkTypes.has('http://open-services.net/ns/core#serviceProvider')).toBe(true);
      expect(linkTypes.has('http://purl.org/dc/terms/title')).toBe(false);
    });

    test('should handle multi-valued properties', () => {
      const graph = $rdf.graph();
      const uri = 'http://example.com/resource1';
      const subject = sym(uri);
      
      graph.add(subject, dcterms('creator'), $rdf.literal('Creator 1'));
      graph.add(subject, dcterms('creator'), $rdf.literal('Creator 2'));
      
      const resource = new OSLCResource(uri, graph);
      const creators = resource.get(dcterms('creator'));
      
      expect(Array.isArray(creators)).toBe(true);
      expect(creators.length).toBe(2);
      expect(creators).toContain('Creator 1');
      expect(creators).toContain('Creator 2');
    });

    test('should set property and remove old values', () => {
      const graph = $rdf.graph();
      const uri = 'http://example.com/resource1';
      const subject = sym(uri);
      
      graph.add(subject, dcterms('title'), $rdf.literal('Old Title'));
      
      const resource = new OSLCResource(uri, graph);
      resource.set(dcterms('title'), $rdf.literal('New Title'));
      
      const title = resource.get(dcterms('title'));
      expect(title).toBe('New Title');
      
      // Verify old value is removed
      const allTitles = graph.each(subject, dcterms('title'));
      expect(allTitles.length).toBe(1);
    });
  });

  describe('Namespace operations', () => {
    test('should create terms from imported namespaces', () => {
      const titleProp = dcterms('title');
      expect(titleProp).toBeDefined();
      expect(titleProp.value).toBe('http://purl.org/dc/terms/title');
      
      const serviceProp = oslc('serviceProvider');
      expect(serviceProp).toBeDefined();
      expect(serviceProp.value).toBe('http://open-services.net/ns/core#serviceProvider');
    });

    test('should create type from rdf namespace', () => {
      const typeProperty = rdf('type');
      expect(typeProperty).toBeDefined();
      expect(typeProperty.value).toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    });
  });

  describe('Round-trip parsing and serialization', () => {
    test('should parse and serialize RDF/XML maintaining data integrity', () => {
      const rdfXml = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:dcterms="http://purl.org/dc/terms/">
  <rdf:Description rdf:about="http://example.com/resource1">
    <dcterms:title>Test Resource</dcterms:title>
    <dcterms:identifier>ID123</dcterms:identifier>
  </rdf:Description>
</rdf:RDF>`;
      
      // Parse
      const graph = $rdf.graph();
      $rdf.parse(rdfXml, graph, 'http://example.com/', 'application/rdf+xml');
      
      // Verify data was parsed
      const subject = sym('http://example.com/resource1');
      const title = graph.any(subject, dcterms('title'));
      const identifier = graph.any(subject, dcterms('identifier'));
      
      expect(title.value).toBe('Test Resource');
      expect(identifier.value).toBe('ID123');
      
      // Serialize
      const serialized = graph.serialize(null, 'application/rdf+xml');
      
      // Parse again to verify
      const graph2 = $rdf.graph();
      $rdf.parse(serialized, graph2, 'http://example.com/', 'application/rdf+xml');
      
      const title2 = graph2.any(subject, dcterms('title'));
      const identifier2 = graph2.any(subject, dcterms('identifier'));
      
      expect(title2.value).toBe('Test Resource');
      expect(identifier2.value).toBe('ID123');
    });
  });
});
