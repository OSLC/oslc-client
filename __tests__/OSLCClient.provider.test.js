import { jest } from '@jest/globals';
import OSLCClient from '../OSLCClient.js';
import LDMClient from '../LDMClient.js';

/**
 * Run a client's request interceptors over a config, in REGISTRATION order.
 *
 * Not the order axios uses: axios composes request interceptors LIFO, so it would run these
 * back to front. It makes no difference to what these tests assert — the CSRF and provider
 * interceptors touch different headers — but the real ordering is only ever exercised by
 * OSLCClient.provider.integration.test.js, which drives a socket through axios itself.
 */
async function runRequestInterceptors(client, config) {
  let result = config;
  for (const handler of client.client.interceptors.request.handlers) {
    if (handler?.fulfilled) result = await handler.fulfilled(result);
  }
  return result;
}

describe('getAuthorization provider', () => {
  it('attaches the header the provider returns, verbatim', async () => {
    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => 'Bearer abc123',
    });

    const config = await runRequestInterceptors(client, {
      url: 'https://example.com/r', method: 'get', headers: {},
    });

    expect(config.headers['Authorization']).toBe('Bearer abc123');
    expect(config._oslcProviderAuth).toBe(true);
  });

  it('clears config.auth, which axios would otherwise apply after interceptors and overwrite the header', async () => {
    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => 'Bearer abc123',
    });

    const config = await runRequestInterceptors(client, {
      url: 'https://example.com/r', method: 'get', headers: {},
      auth: { username: 'u', password: 'p' },
    });

    expect(config.auth).toBeUndefined();
    expect(config.headers['Authorization']).toBe('Bearer abc123');
  });

  it('leaves the request untouched when the provider declines, so the existing ladder still runs', async () => {
    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => null,
    });

    const config = await runRequestInterceptors(client, {
      url: 'https://example.com/r', method: 'get', headers: {},
      auth: { username: 'u', password: 'p' },
    });

    expect(config.headers['Authorization']).toBeUndefined();
    expect(config.auth).toEqual({ username: 'u', password: 'p' });
    expect(config._oslcProviderAuth).toBeFalsy();
  });

  it('passes the request URL to the provider so a host can choose a credential per server', async () => {
    const seen = [];
    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async ({ url, forceRefresh }) => { seen.push({ url, forceRefresh }); return null; },
    });

    await runRequestInterceptors(client, { url: 'https://a.example/r', method: 'get', headers: {} });

    expect(seen).toEqual([{ url: 'https://a.example/r', forceRefresh: false }]);
  });
});

describe('dispatch stand-down', () => {
  function unauthorized(config) {
    return { status: 401, headers: { 'www-authenticate': 'Bearer' }, config };
  }

  it('does not run Basic or ssoCallback when the provider authenticated the request', async () => {
    const ssoCallback = jest.fn();
    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => 'Bearer abc123',
      ssoCallback,
    });
    client._retryAfterAuth = jest.fn();

    await client._handleAuthDispatch(
      unauthorized({ url: 'https://example.com/r', _oslcProviderAuth: true }), 0
    ).catch(() => {});

    expect(ssoCallback).not.toHaveBeenCalled();
    expect(client._retryAfterAuth).not.toHaveBeenCalledWith(
      expect.anything(), 'Basic auth'
    );
  });

  it('still runs the existing ladder when the provider did not authenticate the request', async () => {
    const client = new OSLCClient('u', 'p', null, { getAuthorization: async () => null });
    client._retryAfterAuth = jest.fn().mockResolvedValue(null);

    await client._handleAuthDispatch(
      unauthorized({ url: 'https://example.com/r' }), 0
    ).catch(() => {});

    expect(client._retryAfterAuth).toHaveBeenCalledWith(expect.anything(), 'Basic auth');
  });

  // Branch 2 of dispatch fires on `jauth realm` at ANY status, so a provider-authenticated
  // response carrying that header on a 200 used to reach _handleJasBearerAuth — which
  // overwrites the host's Authorization header and POSTs the user's username/password to the
  // token endpoint. That is the fallback the seam exists to prevent.
  it('raises CredentialRejectedError on a jauth challenge at a non-401 status, without entering JAS bearer auth', async () => {
    const jauth = 'jauth realm="x", token_uri="https://example.com/oidc/token"';
    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => 'Bearer T',
    });
    // Mocked, not merely spied: if the fix regresses, the real handler would POST the
    // password to a live host rather than fail the assertion.
    const jasBearer = jest.spyOn(client, '_handleJasBearerAuth')
      .mockResolvedValue({ status: 200, headers: {}, config: {} });
    // The forced-refresh retry is refused the same way, which is what makes this terminal.
    client._retryAfterAuth = jest.fn().mockResolvedValue({
      status: 200, headers: { 'www-authenticate': jauth }, config: {},
    });

    await expect(client._handleAuthDispatch({
      status: 200,
      headers: { 'www-authenticate': jauth },
      config: { url: 'https://example.com/r', _oslcProviderAuth: true },
    }, 0)).rejects.toMatchObject({
      name: 'CredentialRejectedError',
      // The status the server actually sent, not a 401 invented for the report.
      status: 200,
      url: 'https://example.com/r',
      wwwAuthenticate: jauth,
    });

    expect(jasBearer).not.toHaveBeenCalled();
  });
});

describe('provider refresh', () => {
  function unauthorized(config) {
    return {
      status: 401,
      headers: { 'www-authenticate': 'Bearer realm="JSA"' },
      config,
    };
  }

  it('asks the provider once for a fresh credential and retries once', async () => {
    const calls = [];
    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async ({ forceRefresh }) => { calls.push(forceRefresh); return 'Bearer t'; },
    });
    client._retryAfterAuth = jest.fn().mockResolvedValue({ status: 200, config: {} });

    const result = await client._handleAuthDispatch(
      unauthorized({ url: 'https://example.com/r', _oslcProviderAuth: true }), 0
    );

    expect(result.status).toBe(200);
    const retried = client._retryAfterAuth.mock.calls[0][0];
    expect(retried._oslcForceRefresh).toBe(true);
    expect(retried._oslcAuthHandled).toBe(true);
  });

  it('raises CredentialRejectedError when the retry transport-fails (_retryAfterAuth resolves null)', async () => {
    const client = new OSLCClient('u', 'p', null, { getAuthorization: async () => 'Bearer t' });
    client._retryAfterAuth = jest.fn().mockResolvedValue(null);

    await expect(client._handleAuthDispatch(
      unauthorized({ url: 'https://example.com/r', _oslcProviderAuth: true }), 0
    )).rejects.toMatchObject({
      name: 'CredentialRejectedError',
      status: 401,
      url: 'https://example.com/r',
      wwwAuthenticate: 'Bearer realm="JSA"',
    });
  });

  it('raises CredentialRejectedError when the retried request is refused again', async () => {
    const client = new OSLCClient('u', 'p', null, { getAuthorization: async () => 'Bearer t' });
    // The real _retryAfterAuth RESOLVES a 401: validateStatus treats 401 as success, and the
    // retry carries _oslcAuthHandled so the interceptor passes it through. Mocking null here
    // would assert against a shape this method never returns for a repeated rejection.
    client._retryAfterAuth = jest.fn().mockResolvedValue({
      status: 401,
      headers: { 'www-authenticate': 'Bearer realm="JSA"' },
      config: {},
    });

    await expect(client._handleAuthDispatch(
      unauthorized({ url: 'https://example.com/r', _oslcProviderAuth: true }), 0
    )).rejects.toMatchObject({ name: 'CredentialRejectedError', status: 401 });
  });

  it('does not retry a request that already used a refreshed credential', async () => {
    const client = new OSLCClient('u', 'p', null, { getAuthorization: async () => 'Bearer t' });
    client._retryAfterAuth = jest.fn();

    await expect(client._handleAuthDispatch(
      unauthorized({ url: 'https://example.com/r', _oslcProviderAuth: true, _oslcForceRefresh: true }), 0
    )).rejects.toMatchObject({ name: 'CredentialRejectedError' });

    expect(client._retryAfterAuth).not.toHaveBeenCalled();
  });

  it('passes a successful response through without retrying', async () => {
    const client = new OSLCClient('u', 'p', null, { getAuthorization: async () => 'Bearer t' });
    client._retryAfterAuth = jest.fn();

    const ok = { status: 200, headers: {}, config: { url: 'https://example.com/r', _oslcProviderAuth: true } };

    await expect(client._handleAuthDispatch(ok, 0)).resolves.toBe(ok);
    expect(client._retryAfterAuth).not.toHaveBeenCalled();
  });

  it('passes a non-401 failure through unchanged, so a 403 is not misreported as a credential rejection', async () => {
    const client = new OSLCClient('u', 'p', null, { getAuthorization: async () => 'Bearer t' });
    client._retryAfterAuth = jest.fn();

    const forbidden = { status: 403, headers: {}, config: { url: 'https://example.com/r', _oslcProviderAuth: true } };

    await expect(client._handleAuthDispatch(forbidden, 0)).resolves.toBe(forbidden);
    expect(client._retryAfterAuth).not.toHaveBeenCalled();
  });
});

describe('provider failure', () => {
  it('surfaces a provider error as CredentialRejectedError rather than falling back to Basic', async () => {
    const cause = new Error('user cancelled the login');
    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => { throw cause; },
    });

    await expect(runRequestInterceptors(client, {
      url: 'https://example.com/r', method: 'get', headers: {},
    })).rejects.toMatchObject({
      name: 'CredentialRejectedError',
      url: 'https://example.com/r',
      cause,
    });
  });
});

describe('LDMClient', () => {
  it('shares the axios instance, so incoming-links requests carry the provider header', async () => {
    const client = new OSLCClient('u', 'p', null, {
      getAuthorization: async () => 'Bearer shared',
      ldmBaseUrl: 'https://lqe.example.com',
    });
    const ldm = new LDMClient(client, 'https://lqe.example.com');

    expect(ldm.client).toBe(client.client);

    const config = await runRequestInterceptors(client, {
      url: 'https://lqe.example.com/incoming-links/default', method: 'post', headers: {},
      // The real LDM call site passes { auth: requestAuth, headers } (LDMClient.js), and on the
      // Node http adapter config.auth clobbers the header we just set. Asserting against a
      // config that never had an `auth` key would pass with the `delete` removed.
      auth: { username: 'u', password: 'p' },
    });
    expect(config.headers['Authorization']).toBe('Bearer shared');
    expect(config.auth).toBeUndefined();
  });
});
