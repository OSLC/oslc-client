import { CredentialRejectedError, OSLCError } from '../index.js';

describe('CredentialRejectedError', () => {
  it('carries the challenge so a host can tell an expired token from a missing one', () => {
    const err = new CredentialRejectedError('Credential rejected', {
      status: 401,
      url: 'https://example.com/oslc/areas/1',
      wwwAuthenticate: 'Bearer realm="JSA", error=insufficient_scope',
    });

    expect(err).toBeInstanceOf(OSLCError);
    expect(err.name).toBe('CredentialRejectedError');
    expect(err.status).toBe(401);
    expect(err.url).toBe('https://example.com/oslc/areas/1');
    expect(err.wwwAuthenticate).toBe('Bearer realm="JSA", error=insufficient_scope');
  });

  it('preserves the underlying error when the provider itself failed', () => {
    const cause = new Error('token endpoint unreachable');
    const err = new CredentialRejectedError('Provider failed', { cause });

    expect(err.cause).toBe(cause);
    expect(err.wwwAuthenticate).toBeNull();
  });
});
