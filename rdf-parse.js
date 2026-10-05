import * as $rdf from 'rdflib';

/**
 * Parse RDF with rdflib, tolerating SPARQL-style `PREFIX` / `BASE` directives in Turtle.
 *
 * Turtle 1.1 allows both spellings of a prefix declaration: the original `@prefix ex: <…> .` and the
 * SPARQL-style `PREFIX ex: <…>` — case-insensitive, no leading `@`, no terminating `.`. Apache Jena
 * accepts both. **rdflib accepts only the first**, and fails on the very first line with
 * "Bad syntax: expected directive or statement". Still true in 2.4.1, the latest release.
 *
 * Servers do emit the SPARQL style — the genOSLC servers emit it for every document they serve — so
 * any response negotiated as Turtle is unparseable without this. It has been easy to miss because
 * this client asks for `application/rdf+xml` at q=1.0 and Turtle only at q=0.9, so Turtle arrives
 * only when a server cannot produce RDF/XML. When it does, the failure is total: not a missing
 * triple, but nothing at all.
 *
 * **The document is not at fault**, so this does not rewrite on principle. It parses first and only
 * rewrites after rdflib has already refused, which keeps two promises: a document rdflib can read is
 * never modified, and a literal containing the word PREFIX is never touched in a document that
 * parsed cleanly.
 *
 * Non-Turtle content types are passed straight through — there is nothing to normalise in RDF/XML.
 *
 * @param {string} text the document
 * @param {object} store the rdflib graph to parse into
 * @param {string} baseIri base for relative IRIs — the URL the document was fetched from
 * @param {string} contentType the negotiated media type
 * @throws whatever rdflib throws when the text is not valid under either spelling
 */
export function parseRdf(text, store, baseIri, contentType) {
  const isTurtle = typeof contentType === 'string' && contentType.includes('turtle');
  if (!isTurtle) {
    $rdf.parse(text, store, baseIri, contentType);
    return;
  }
  try {
    $rdf.parse(text, store, baseIri, contentType);
  } catch (error) {
    const normalized = normalizeSparqlStyleDirectives(text);
    if (normalized === text) {
      throw error;        // nothing to retry — the document is wrong in some other way
    }
    $rdf.parse(normalized, store, baseIri, contentType);
  }
}

/**
 * Rewrite SPARQL-style `PREFIX`/`BASE` directives to the `@prefix`/`@base` form rdflib understands.
 *
 * Only whole lines are considered, and only in the document's leading directive block — the run of
 * blank lines, comments and directives before the first statement. Turtle permits a directive
 * anywhere, but servers emit them at the top, and stopping at the first statement is what makes this
 * safe: no literal in the body can be reached, however it is spelled or spanned.
 *
 * Returns the input unchanged when there is nothing to rewrite, which is the signal to rethrow the
 * original parse error rather than retry.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeSparqlStyleDirectives(text) {
  const lines = text.split('\n');
  const out = [];
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      out.push(line);
      continue;
    }

    const directive = /^(\s*)(PREFIX|BASE)\s+(.*?)\s*$/i.exec(line);
    if (directive && !directive[3].endsWith('.')) {
      out.push(`${directive[1]}@${directive[2].toLowerCase()} ${directive[3]} .`);
      changed = true;
      continue;
    }

    if (/^\s*@(prefix|base)\b/i.test(line)) {
      out.push(line);
      continue;
    }

    out.push(...lines.slice(i));     // first statement — copy the remainder verbatim
    break;
  }

  return changed ? out.join('\n') : text;
}
