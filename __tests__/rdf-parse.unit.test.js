import * as $rdf from 'rdflib';
import { parseRdf, normalizeSparqlStyleDirectives } from '../rdf-parse.js';

/**
 * Turtle 1.1 allows `PREFIX ex: <…>` as well as `@prefix ex: <…> .`; Jena accepts both, rdflib only
 * the second, and still only the second in 2.4.1. Servers do emit the SPARQL style.
 */
describe('parseRdf', () => {
  const BASE = 'https://server/domain/VOCAB';

  function count(ttl, ct = 'text/turtle') {
    const store = $rdf.graph();
    parseRdf(ttl, store, BASE, ct);
    return store.statementsMatching(null, null, null).length;
  }

  it('parses the SPARQL-style PREFIX that rdflib rejects outright', () => {
    const ttl = 'PREFIX ex: <http://example.org/>\nex:a ex:b ex:c .';
    expect(() => $rdf.parse(ttl, $rdf.graph(), BASE, 'text/turtle')).toThrow();
    expect(count(ttl)).toBe(1);
  });

  it('handles BASE, lowercase, and a mixture with @prefix', () => {
    const ttl = [
      '# comment',
      'BASE <http://example.org/>',
      '',
      'prefix ex: <http://example.org/>',
      '@prefix dc: <http://purl.org/dc/terms/> .',
      'ex:a dc:title "t" .'
    ].join('\n');
    expect(count(ttl)).toBe(1);
  });

  it('leaves a document rdflib already accepts byte-identical', () => {
    const ttl = '@prefix ex: <http://example.org/> .\nex:a ex:b "PREFIX ex: <nope>" .';
    expect(normalizeSparqlStyleDirectives(ttl)).toBe(ttl);
    expect(count(ttl)).toBe(1);
  });

  /** The rewrite stops at the first statement, so no literal in the body is ever reachable. */
  it('never rewrites inside the body, even when a literal looks like a directive', () => {
    const ttl = [
      'PREFIX ex: <http://example.org/>',
      'ex:a ex:note """quoting',
      'PREFIX foo: <http://bar/>',
      'as an example.""" .'
    ].join('\n');
    const store = $rdf.graph();
    parseRdf(ttl, store, BASE, 'text/turtle');
    const literal = store.statementsMatching(
      $rdf.namedNode('http://example.org/a'), $rdf.namedNode('http://example.org/note'), null)[0].object.value;
    expect(literal).toContain('PREFIX foo: <http://bar/>');
    expect(literal).not.toContain('@prefix');
  });

  it('passes non-Turtle content straight through', () => {
    const rdfXml = '<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"' +
      ' xmlns:ex="http://example.org/"><rdf:Description rdf:about="http://example.org/a">' +
      '<ex:b rdf:resource="http://example.org/c"/></rdf:Description></rdf:RDF>';
    expect(count(rdfXml, 'application/rdf+xml')).toBe(1);
  });

  it('rethrows the original error when the document is broken some other way', () => {
    expect(() => parseRdf('@prefix ex: <http://example.org/> .\nnot turtle', $rdf.graph(), BASE, 'text/turtle'))
      .toThrow();
  });
});
