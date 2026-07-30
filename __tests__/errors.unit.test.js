/**
 * Unit tests for the typed OSLC error hierarchy (errors.js).
 */
import { OSLCError, PreconditionFailedError, ConflictError, oslcErrorFrom } from '../errors.js';

describe('OSLCError hierarchy', () => {
  it('OSLCError carries status, statusText, serverMessage, url', () => {
    const e = new OSLCError('Failed to update resource (500): https://s/r/1', {
      status: 500, statusText: 'Server Error', serverMessage: 'boom', url: 'https://s/r/1'
    });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('OSLCError');
    expect(e.status).toBe(500);
    expect(e.statusText).toBe('Server Error');
    expect(e.serverMessage).toBe('boom');
    expect(e.url).toBe('https://s/r/1');
  });

  it('subclasses are instanceof OSLCError with their own names', () => {
    const p = new PreconditionFailedError('stale', { status: 412 });
    const c = new ConflictError('dup', { status: 409 });
    expect(p).toBeInstanceOf(OSLCError);
    expect(p.name).toBe('PreconditionFailedError');
    expect(c).toBeInstanceOf(OSLCError);
    expect(c.name).toBe('ConflictError');
  });
});

describe('oslcErrorFrom', () => {
  it('maps an axios rejection with response.status 412 to PreconditionFailedError', () => {
    const axiosError = Object.assign(new Error('Request failed with status code 412'), {
      response: { status: 412, statusText: 'Precondition Failed', data: 'stale etag' }
    });
    const e = oslcErrorFrom(axiosError, 'https://s/r/1', 'Failed to update resource');
    expect(e).toBeInstanceOf(PreconditionFailedError);
    expect(e.status).toBe(412);
    expect(e.serverMessage).toBe('stale etag');
    expect(e.url).toBe('https://s/r/1');
    expect(e.message).toContain('Failed to update resource');
    expect(e.message).toContain('412');
  });

  it('maps status 409 to ConflictError', () => {
    const e = oslcErrorFrom({ status: 409, statusText: 'Conflict', data: 'Slug exists' },
      'https://s/factory', 'Failed to create resource');
    expect(e).toBeInstanceOf(ConflictError);
    expect(e.status).toBe(409);
  });

  it('maps a resolved non-2xx response object (no .response wrapper) to OSLCError', () => {
    const e = oslcErrorFrom({ status: 405, statusText: 'Method Not Allowed', data: 'nope' },
      'https://s/r/1', 'Failed to delete resource');
    expect(e).toBeInstanceOf(OSLCError);
    expect(e).not.toBeInstanceOf(ConflictError);
    expect(e).not.toBeInstanceOf(PreconditionFailedError);
    expect(e.status).toBe(405);
    expect(e.serverMessage).toBe('nope');
  });

  it('stringifies non-string response data for serverMessage', () => {
    const e = oslcErrorFrom({ status: 400, data: { error: 'bad shape' } }, 'u', 'msg');
    expect(e.serverMessage).toBe(JSON.stringify({ error: 'bad shape' }));
  });

  it('handles a bare network Error (no response) with null status', () => {
    const e = oslcErrorFrom(new Error('socket hang up'), 'https://s/r/1', 'Failed to update resource');
    expect(e).toBeInstanceOf(OSLCError);
    expect(e.status).toBeNull();
    expect(e.cause).toBeInstanceOf(Error);
  });

  it('passes through an existing OSLCError unchanged', () => {
    const original = new ConflictError('dup', { status: 409 });
    expect(oslcErrorFrom(original, 'u', 'msg')).toBe(original);
  });
});

describe('package root exports', () => {
  it('exposes error classes and core resource classes from index.js', async () => {
    const pkg = await import('../index.js');
    expect(pkg.OSLCError).toBeDefined();
    expect(pkg.PreconditionFailedError).toBeDefined();
    expect(pkg.ConflictError).toBeDefined();
    expect(pkg.oslcErrorFrom).toBeDefined();
    expect(pkg.OSLCResource).toBeDefined();
    expect(pkg.ServiceProvider).toBeDefined();
    expect(pkg.Compact).toBeDefined();
  });
});
