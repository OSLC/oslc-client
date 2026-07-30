/**
 * Unit tests for OSLCClient write methods: putResource, createResource, deleteResource.
 * The axios instance methods are mocked per-test; _initialized is forced true so
 * _ensureInitialized() does not wrap the client with cookie-jar support.
 */
import { jest } from '@jest/globals';
import OSLCClient from '../OSLCClient.js';
import { OSLCError, PreconditionFailedError, ConflictError } from '../errors.js';

function makeClient() {
  const client = new OSLCClient('testuser', 'testpass');
  client._initialized = true; // skip node-module init / cookie-jar wrapping
  return client;
}

function makeResource(url = 'https://server/components/c0/artifacts/g1', etag = '"v1"') {
  return {
    store: { serialize: jest.fn(() => '<rdf:RDF/>') },
    getURI: () => url,
    etag
  };
}

function axiosRejection(status, statusText, data = '') {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, statusText, data, headers: {} }
  });
}

describe('putResource', () => {
  it('sends If-Match from resource.etag when eTag arg is omitted', async () => {
    const client = makeClient();
    client.client.put = jest.fn().mockResolvedValue({ status: 200, headers: { etag: '"v2"' } });
    const resource = makeResource('https://server/r/1', '"v1"');

    await client.putResource(resource);

    const [url, body, config] = client.client.put.mock.calls[0];
    expect(url).toBe('https://server/r/1');
    expect(body).toBe('<rdf:RDF/>');
    expect(config.headers['If-Match']).toBe('"v1"');
  });

  it('explicit eTag argument overrides resource.etag (including "*")', async () => {
    const client = makeClient();
    client.client.put = jest.fn().mockResolvedValue({ status: 200, headers: {} });
    const resource = makeResource('https://server/r/1', '"v1"');

    await client.putResource(resource, '*');

    const [, , config] = client.client.put.mock.calls[0];
    expect(config.headers['If-Match']).toBe('*');
  });

  it('omits If-Match when neither eTag arg nor resource.etag is set', async () => {
    const client = makeClient();
    client.client.put = jest.fn().mockResolvedValue({ status: 200, headers: {} });
    // Create resource without etag property (etag will be undefined)
    const resource = {
      store: { serialize: jest.fn(() => '<rdf:RDF/>') },
      getURI: () => 'https://server/r/1'
    };

    await client.putResource(resource);

    const [, , config] = client.client.put.mock.calls[0];
    expect(config.headers['If-Match']).toBeUndefined();
  });

  it('sends X-Jazz-CSRF-Prevent header', async () => {
    const client = makeClient();
    client.client.put = jest.fn().mockResolvedValue({ status: 200, headers: {} });

    await client.putResource(makeResource());

    const [, , config] = client.client.put.mock.calls[0];
    expect(config.headers['X-Jazz-CSRF-Prevent']).toBeDefined();
  });

  it('updates resource.etag from the response ETag header on success', async () => {
    const client = makeClient();
    client.client.put = jest.fn().mockResolvedValue({ status: 200, headers: { etag: '"v2"' } });
    const resource = makeResource('https://server/r/1', '"v1"');

    const result = await client.putResource(resource);

    expect(result).toBe(resource);
    expect(resource.etag).toBe('"v2"');
  });

  it('throws PreconditionFailedError on a 412 rejection', async () => {
    const client = makeClient();
    client.client.put = jest.fn().mockRejectedValue(axiosRejection(412, 'Precondition Failed', 'stale'));
    const resource = makeResource('https://server/r/1', '"old"');

    await expect(client.putResource(resource)).rejects.toBeInstanceOf(PreconditionFailedError);
    expect(resource.etag).toBe('"old"'); // unchanged on failure
  });

  it('throws OSLCError with serverMessage on other failures', async () => {
    const client = makeClient();
    client.client.put = jest.fn().mockRejectedValue(axiosRejection(400, 'Bad Request', 'missing required property'));

    const err = await client.putResource(makeResource()).catch(e => e);
    expect(err).toBeInstanceOf(OSLCError);
    expect(err.status).toBe(400);
    expect(err.serverMessage).toBe('missing required property');
  });
});

describe('createResource', () => {
  function makeCreateClient() {
    const client = makeClient();
    client.sp = { getCreationFactory: jest.fn(() => 'https://server/components/c0/artifacts') };
    client.getResource = jest.fn().mockResolvedValue({ getURI: () => 'https://server/components/c0/artifacts/new1', etag: '"1"' });
    return client;
  }

  it('POSTs to the creation factory with CSRF header and returns the fetched resource', async () => {
    const client = makeCreateClient();
    client.client.post = jest.fn().mockResolvedValue({
      status: 201,
      headers: { location: 'https://server/components/c0/artifacts/new1' }
    });

    const created = await client.createResource('http://www.omg.org/spec/BMM#Goal', makeResource());

    const [url, body, config] = client.client.post.mock.calls[0];
    expect(url).toBe('https://server/components/c0/artifacts');
    expect(body).toBe('<rdf:RDF/>');
    expect(config.headers['X-Jazz-CSRF-Prevent']).toBeDefined();
    expect(client.getResource).toHaveBeenCalledWith('https://server/components/c0/artifacts/new1');
    expect(created.getURI()).toBe('https://server/components/c0/artifacts/new1');
  });

  it('throws ConflictError on 409 (duplicate Slug)', async () => {
    const client = makeCreateClient();
    client.client.post = jest.fn().mockRejectedValue(axiosRejection(409, 'Conflict', 'Slug already exists'));

    const err = await client.createResource('http://www.omg.org/spec/BMM#Goal', makeResource()).catch(e => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.serverMessage).toBe('Slug already exists');
  });

  it('throws OSLCError when creation succeeds without a Location header', async () => {
    const client = makeCreateClient();
    client.client.post = jest.fn().mockResolvedValue({ status: 201, headers: {} });

    const err = await client.createResource('http://www.omg.org/spec/BMM#Goal', makeResource()).catch(e => e);
    expect(err).toBeInstanceOf(OSLCError);
    expect(err.message).toContain('Location');
  });

  it('throws OSLCError when no creation factory exists for the type', async () => {
    const client = makeCreateClient();
    client.sp.getCreationFactory.mockReturnValue(null);

    const err = await client.createResource('http://example.com/Unknown', makeResource()).catch(e => e);
    expect(err).toBeInstanceOf(OSLCError);
    expect(err.message).toContain('No creation factory');
  });
});
