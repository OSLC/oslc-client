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
  // Caching alone leaves the fan-out the release note claims to have fixed: N parallel
  // requests that all 401 at once all miss the empty cache and all POST the password.
  it('coalesces concurrent fetches into a single password submission', async () => {
    let releasePost;
    client.client.post = jest.fn(() => new Promise(resolve => {
      releasePost = () => resolve({ data: 'TOKEN-1' });
    }));

    const inFlight = [0, 1, 2, 3, 4].map(i => client._handleAuthDispatch(
      jauthChallenge({ url: `https://jazz.example.com/rm/${i}`, headers: {} }), 0
    ));

    releasePost();
    const results = await Promise.all(inFlight);

    expect(client.client.post).toHaveBeenCalledTimes(1);
    expect(results.every(r => r.status === 200)).toBe(true);
    expect(client.client.request.mock.calls.every(
      ([config]) => config.headers['Authorization'] === 'Bearer TOKEN-1'
    )).toBe(true);
  });

  it('clears the in-flight entry when a fetch fails, so the next attempt is not poisoned', async () => {
    client.client.post = jest.fn()
      .mockRejectedValueOnce(new Error('token endpoint down'))
      .mockResolvedValueOnce({ data: 'TOKEN-1' });

    await expect(client._handleAuthDispatch(
      jauthChallenge({ url: 'https://jazz.example.com/rm/a', headers: {} }), 0
    )).rejects.toThrow('token endpoint down');

    const result = await client._handleAuthDispatch(
      jauthChallenge({ url: 'https://jazz.example.com/rm/a', headers: {} }), 0
    );

    expect(result.status).toBe(200);
    expect(client.client.post).toHaveBeenCalledTimes(2);
    expect(client._jasBearerTokenFetches.size).toBe(0);
  });
});
