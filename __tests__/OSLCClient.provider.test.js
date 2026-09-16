import { jest } from '@jest/globals';
import OSLCClient from '../OSLCClient.js';

/** Run a client's request interceptors over a config, as axios would. */
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
});
