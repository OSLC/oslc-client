import { jest } from '@jest/globals';
import OSLCClient from '../OSLCClient.js';

const TOKEN_URI = 'https://jazz.example.com/jts/auth/token';

function jauthChallenge(config) {
  return {
    status: 401,
    headers: { 'www-authenticate': `jauth realm="JTS", token_uri="${TOKEN_URI}"` },
    config,
  };
}

describe('JAS bearer auth', () => {
  let client;

  beforeEach(() => {
    client = new OSLCClient('jamsden', 'secret');
    client.client.post = jest.fn().mockResolvedValue({ data: 'TOKEN-1' });
    client.client.request = jest.fn().mockResolvedValue({ status: 200, config: {} });
  });

  it('fetches a token once and reuses it across requests', async () => {
    await client._handleAuthDispatch(jauthChallenge({ url: 'https://jazz.example.com/rm/a', headers: {} }), 0);
    await client._handleAuthDispatch(jauthChallenge({ url: 'https://jazz.example.com/rm/b', headers: {} }), 0);

    // The password is submitted once, not once per request.
    expect(client.client.post).toHaveBeenCalledTimes(1);
    const secondRetry = client.client.request.mock.calls[1][0];
    expect(secondRetry.headers['Authorization']).toBe('Bearer TOKEN-1');
  });

  it('re-fetches once when the cached token is rejected', async () => {
    client.client.request
      .mockResolvedValueOnce({ status: 401, headers: {}, config: {} })   // cached token refused
      .mockResolvedValueOnce({ status: 200, config: {} });               // fresh token accepted
    client.client.post
      .mockResolvedValueOnce({ data: 'TOKEN-1' })
      .mockResolvedValueOnce({ data: 'TOKEN-2' });

    client._jasBearerTokens.set(TOKEN_URI, 'STALE');

    const result = await client._handleAuthDispatch(
      jauthChallenge({ url: 'https://jazz.example.com/rm/a', headers: {} }), 0
    );

    expect(result.status).toBe(200);
    expect(client._jasBearerTokens.get(TOKEN_URI)).toBe('TOKEN-1');
  });

  it('caches per token URI, so two servers do not share a token', async () => {
    const other = 'https://other.example.com/jts/auth/token';
    await client._handleAuthDispatch(jauthChallenge({ url: 'https://jazz.example.com/rm/a', headers: {} }), 0);

    client.client.post.mockResolvedValue({ data: 'TOKEN-OTHER' });
    await client._handleAuthDispatch({
      status: 401,
      headers: { 'www-authenticate': `jauth realm="JTS", token_uri="${other}"` },
      config: { url: 'https://other.example.com/rm/a', headers: {} },
    }, 0);

    expect(client._jasBearerTokens.get(TOKEN_URI)).toBe('TOKEN-1');
    expect(client._jasBearerTokens.get(other)).toBe('TOKEN-OTHER');
  });
});
