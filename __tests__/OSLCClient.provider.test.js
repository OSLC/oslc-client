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
