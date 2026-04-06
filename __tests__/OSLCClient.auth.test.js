/**
 * Unit tests for OSLCClient constructor auth options (cookieJar, ssoCallback)
 * and condition-based auth dispatch.
 * These are unit tests — they mock dependencies and do not require a real server.
 */

// Mock axios and Node.js-specific modules before importing OSLCClient
import { jest } from '@jest/globals';

// We need to mock the dynamic imports that OSLCClient.js performs at module level.
// Since OSLCClient uses top-level await for conditional imports, we mock the
// modules themselves so CookieJar and wrapper are available.

const mockWrapper = jest.fn((instance) => instance);
const MockCookieJar = jest.fn();

jest.unstable_mockModule('axios-cookiejar-support', () => ({
    wrapper: mockWrapper,
}));

jest.unstable_mockModule('tough-cookie', () => ({
    CookieJar: MockCookieJar,
}));

jest.unstable_mockModule('@xmldom/xmldom', () => ({
    DOMParser: jest.fn(),
}));

// Must import after mocks are registered
const { default: OSLCClient, isIdpUrl } = await import('../OSLCClient.js');

describe('OSLCClient constructor auth options', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('backward compatible — no options parameter works', () => {
        const client = new OSLCClient('user', 'pass');
        expect(client.userid).toBe('user');
        expect(client.password).toBe('pass');
        expect(client.configuration_context).toBeNull();
    });

    test('backward compatible — three-arg form works', () => {
        const client = new OSLCClient('user', 'pass', 'some-config');
        expect(client.configuration_context).toBe('some-config');
    });

    test('creates private cookieJar when none provided', () => {
        const client = new OSLCClient('user', 'pass');
        // CookieJar constructor should have been called to create a default jar
        expect(MockCookieJar).toHaveBeenCalled();
        expect(client.jar).toBeInstanceOf(MockCookieJar);
    });

    test('uses provided cookieJar instead of creating a new one', () => {
        const sharedJar = { iAmAJar: true };
        MockCookieJar.mockClear();

        const client = new OSLCClient('user', 'pass', null, { cookieJar: sharedJar });
        // Should NOT create a new CookieJar — should use the provided one
        expect(MockCookieJar).not.toHaveBeenCalled();
        expect(client.jar).toBe(sharedJar);
    });

    test('stores ssoCallback when provided', () => {
        const callback = async () => {};
        const client = new OSLCClient('user', 'pass', null, { ssoCallback: callback });
        expect(client.ssoCallback).toBe(callback);
    });

    test('ssoCallback defaults to null when not provided', () => {
        const client = new OSLCClient('user', 'pass');
        expect(client.ssoCallback).toBeNull();
    });

    test('ssoCallback defaults to null with empty options', () => {
        const client = new OSLCClient('user', 'pass', null, {});
        expect(client.ssoCallback).toBeNull();
    });
});

describe('auth dispatch', () => {
    let client;

    beforeEach(() => {
        jest.clearAllMocks();
        client = new OSLCClient('user', 'pass');
    });

    test('JEE forms auth — dispatches on authrequired header', async () => {
        const originalConfig = { url: 'https://server.example.com/rm/resources/1', method: 'get', headers: {} };
        const authRequiredResponse = {
            status: 200,
            headers: { 'x-com-ibm-team-repository-web-auth-msg': 'authrequired' },
            config: originalConfig,
            data: '',
        };
        const successResponse = {
            status: 200,
            headers: {},
            config: originalConfig,
            data: '<rdf>resource data</rdf>',
        };

        // Mock: j_security_check POST returns 302 (success), then retry returns resource
        let postCalled = false;
        let requestCalled = false;
        client.client.post = jest.fn(async () => {
            postCalled = true;
            return { status: 302, headers: {}, config: {}, data: '' };
        });
        client.client.request = jest.fn(async () => {
            requestCalled = true;
            return successResponse;
        });

        const result = await client._handleAuthDispatch(authRequiredResponse, 0);

        expect(postCalled).toBe(true);
        // Verify j_security_check URL was constructed correctly
        expect(client.client.post.mock.calls[0][0]).toBe('https://server.example.com/rm/j_security_check');
        expect(requestCalled).toBe(true);
        expect(result.data).toBe('<rdf>resource data</rdf>');
    });

    test('JAS bearer — dispatches on jauth realm header', async () => {
        const originalConfig = { url: 'https://server.example.com/rm/resources/1', method: 'get', headers: {} };
        const jasResponse = {
            status: 200,
            headers: { 'www-authenticate': 'jauth realm="https://server.example.com" token_uri="https://server.example.com/jas/token"' },
            config: originalConfig,
            data: '',
        };
        const successResponse = {
            status: 200,
            headers: {},
            config: originalConfig,
            data: '<rdf>resource data</rdf>',
        };

        client.client.post = jest.fn(async () => {
            return { status: 200, headers: {}, config: {}, data: 'bearer-token-value' };
        });
        client.client.request = jest.fn(async () => successResponse);

        const result = await client._handleAuthDispatch(jasResponse, 0);

        // Verify token endpoint was called
        expect(client.client.post.mock.calls[0][0]).toBe('https://server.example.com/jas/token');
        // Verify bearer token was set on the original request
        expect(originalConfig.headers['Authorization']).toBe('Bearer bearer-token-value');
        expect(result.data).toBe('<rdf>resource data</rdf>');
    });

    test('Basic auth — dispatches on plain 401', async () => {
        const originalConfig = { url: 'https://server.example.com/rm/resources/1', method: 'get', headers: {} };
        const unauthorizedResponse = {
            status: 401,
            headers: {},
            config: originalConfig,
            data: 'Unauthorized',
        };
        const successResponse = {
            status: 200,
            headers: {},
            config: originalConfig,
            data: '<rdf>resource data</rdf>',
        };

        client.client.request = jest.fn(async () => successResponse);

        const result = await client._handleAuthDispatch(unauthorizedResponse, 0);

        // Verify auth was set on the request config
        expect(originalConfig.auth).toEqual({ username: 'user', password: 'pass' });
        expect(result.data).toBe('<rdf>resource data</rdf>');
    });

    test('no challenge — returns response as-is', async () => {
        const normalResponse = {
            status: 200,
            headers: {},
            config: { url: 'https://server.example.com/rm/resources/1', headers: {} },
            data: '<rdf>resource data</rdf>',
        };

        const result = await client._handleAuthDispatch(normalResponse, 0);

        expect(result).toBe(normalResponse);
    });

    test('AUTH_EXHAUSTED — rejects when cycle limit reached', async () => {
        const response = {
            status: 401,
            headers: {},
            config: { url: 'https://server.example.com/rm/resources/1', headers: {} },
            data: 'Unauthorized',
        };

        try {
            await client._handleAuthDispatch(response, 3);
            throw new Error('Should have rejected');
        } catch (error) {
            expect(error.code).toBe('AUTH_EXHAUSTED');
            expect(error.url).toBe('https://server.example.com/rm/resources/1');
        }
    });

    test('AUTH_EXHAUSTED — rejects when Basic auth retry also returns 401', async () => {
        const originalConfig = { url: 'https://server.example.com/rm/resources/1', method: 'get', headers: {} };
        const unauthorizedResponse = {
            status: 401,
            headers: {},
            config: originalConfig,
            data: 'Unauthorized',
        };

        // Basic auth retry also returns 401, which triggers cycle 1 dispatch,
        // which also returns 401 with basic already attempted, and so on until exhausted
        client.client.request = jest.fn(async () => ({
            status: 401,
            headers: {},
            config: originalConfig,
            data: 'Unauthorized',
        }));

        try {
            await client._handleAuthDispatch(unauthorizedResponse, 0);
            throw new Error('Should have rejected');
        } catch (error) {
            expect(error.code).toBe('AUTH_EXHAUSTED');
            expect(error.attempted).toContain('basic');
        }
    });

    test('SSO detection — dispatches on 3xx redirect to IdP URL', async () => {
        const originalConfig = { url: 'https://server.example.com/rm/resources/1', method: 'get', headers: {} };
        const redirectResponse = {
            status: 302,
            headers: { location: 'https://idp.example.com/adfs/ls?param=value' },
            config: originalConfig,
            data: '',
        };

        // _attemptProgrammaticSso returns null (stub), no ssoCallback set
        try {
            await client._handleAuthDispatch(redirectResponse, 0);
            throw new Error('Should have rejected');
        } catch (error) {
            expect(error.code).toBe('AUTH_EXHAUSTED');
            expect(error.ssoDetected).toBe(true);
            expect(error.attempted).toContain('sso');
        }
    });
});

describe('isIdpUrl', () => {
    test('matches ADFS login URL', () => {
        expect(isIdpUrl('https://idp.example.com/adfs/ls?param=value')).toBe(true);
    });

    test('matches ADFS OAuth2 URL', () => {
        expect(isIdpUrl('https://idp.example.com/adfs/oauth2/authorize')).toBe(true);
    });

    test('matches OAuth2 authorize URL', () => {
        expect(isIdpUrl('https://auth.example.com/oauth2/authorize?client_id=abc')).toBe(true);
    });

    test('matches Keycloak realm URL', () => {
        expect(isIdpUrl('https://keycloak.example.com/auth/realms/myrealm/protocol/openid-connect/auth')).toBe(true);
    });

    test('matches SAML SSO URL', () => {
        expect(isIdpUrl('https://idp.example.com/saml/sso')).toBe(true);
    });

    test('does not match normal URLs', () => {
        expect(isIdpUrl('https://server.example.com/rm/resources/1')).toBe(false);
    });

    test('does not match null/undefined', () => {
        expect(isIdpUrl(null)).toBe(false);
        expect(isIdpUrl(undefined)).toBe(false);
    });
});
