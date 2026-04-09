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

// Use a real DOMParser from xmldom so _parseLoginForm can work in tests.
// We import it eagerly here (outside the mock factory) so the factory closure
// captures the real class.
const { DOMParser: RealDOMParser } = await import('@xmldom/xmldom');

jest.unstable_mockModule('@xmldom/xmldom', () => ({
    DOMParser: RealDOMParser,
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

    test('creates private cookieJar when none provided', async () => {
        const client = new OSLCClient('user', 'pass');
        await client._ensureInitialized();
        // CookieJar constructor should have been called to create a default jar
        expect(MockCookieJar).toHaveBeenCalled();
        expect(client.jar).toBeInstanceOf(MockCookieJar);
    });

    test('uses provided cookieJar instead of creating a new one', async () => {
        const sharedJar = { iAmAJar: true };
        MockCookieJar.mockClear();

        const client = new OSLCClient('user', 'pass', null, { cookieJar: sharedJar });
        await client._ensureInitialized();
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

    beforeEach(async () => {
        jest.clearAllMocks();
        client = new OSLCClient('user', 'pass');
        await client._ensureInitialized();
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

    test('non-IdP redirect — follows redirect manually', async () => {
        const redirectResponse = {
            status: 302,
            headers: { location: 'https://server.example.com/rm/resources/1-resolved' },
            config: { url: 'https://server.example.com/rm/resources/1', headers: {}, method: 'get' },
        };
        const finalResponse = {
            status: 200,
            headers: {},
            config: { url: 'https://server.example.com/rm/resources/1-resolved', headers: {} },
            data: '<rdf>resource data</rdf>',
        };

        client.client.request = jest.fn(async () => finalResponse);

        const result = await client._handleAuthDispatch(redirectResponse, 0);

        expect(client.client.request).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'https://server.example.com/rm/resources/1-resolved' })
        );
        expect(result).toBe(finalResponse);
    });

    test('IdP redirect — triggers SSO auth', async () => {
        const ssoRedirectResponse = {
            status: 302,
            headers: { location: 'https://idp.example.com/adfs/ls?SAMLRequest=abc' },
            config: { url: 'https://server.example.com/rm/resources/1', headers: {} },
        };

        // SSO will fail (no callback, programmatic returns null) → AUTH_EXHAUSTED
        await expect(client._handleAuthDispatch(ssoRedirectResponse, 0))
            .rejects.toMatchObject({ code: 'AUTH_EXHAUSTED', ssoDetected: true });
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

        // Basic auth retry also returns 401
        client.client.request = jest.fn(async () => ({
            status: 401,
            headers: {},
            config: originalConfig,
            data: 'Unauthorized',
        }));

        // Basic auth tried once, fails → still 401 with methods attempted → AUTH_EXHAUSTED
        try {
            await client._handleAuthDispatch(unauthorizedResponse, 0);
            throw new Error('Should have rejected');
        } catch (error) {
            expect(error.code).toBe('AUTH_EXHAUSTED');
            expect(error.attempted).toContain('basic');
            expect(client.client.request).toHaveBeenCalledTimes(1);
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

// --- Programmatic SSO tests ---

const ADFS_LOGIN_HTML = `<html><body>
<form method="POST" action="https://adfs.example.com/adfs/ls">
  <input type="hidden" name="SAMLRequest" value="base64data" />
  <input type="hidden" name="RelayState" value="https://server/rm" />
  <input type="text" name="UserName" />
  <input type="password" name="Password" />
  <input type="submit" value="Sign In" />
</form>
</body></html>`;

const KEYCLOAK_LOGIN_HTML = `<html><body>
<form method="post" action="https://keycloak.example.com/auth/realms/master/login-actions/authenticate?session_code=abc123">
  <input type="hidden" name="csrf_token" value="xyz789" />
  <input type="text" name="username" id="username" />
  <input type="password" name="password" id="password" />
  <button type="submit">Login</button>
</form>
</body></html>`;

const NO_FORM_HTML = `<html><body><h1>Welcome</h1><p>No login form here.</p></body></html>`;

describe('programmatic SSO', () => {
    let client;

    beforeEach(async () => {
        jest.clearAllMocks();
        client = new OSLCClient('ssouser', 'ssopass');
        await client._ensureInitialized();
    });

    test('follows redirect, parses login form, submits credentials, retries original request', async () => {
        const originalRequest = { url: 'https://server.example.com/rm/resources/1', method: 'get', headers: {} };
        const idpUrl = 'https://adfs.example.com/adfs/ls?login=1';
        const successData = '<rdf>resource data</rdf>';

        // GET to IdP returns the login form HTML (200)
        client.client.get = jest.fn(async () => ({
            status: 200,
            headers: { 'content-type': 'text/html' },
            data: ADFS_LOGIN_HTML,
        }));

        // POST to form action returns 200 (successful login, post-redirect)
        client.client.post = jest.fn(async () => ({
            status: 200,
            headers: {},
            data: '<html>Logged in</html>',
        }));

        // Retry of original request succeeds
        client.client.request = jest.fn(async () => ({
            status: 200,
            headers: {},
            config: originalRequest,
            data: successData,
        }));

        const result = await client._attemptProgrammaticSso(originalRequest, idpUrl);

        // Verify GET was called to fetch the IdP page
        expect(client.client.get).toHaveBeenCalledWith(idpUrl, expect.objectContaining({
            maxRedirects: 0,
            validateStatus: expect.any(Function),
        }));

        // Verify POST was called with correct form data
        expect(client.client.post).toHaveBeenCalled();
        const [postUrl, postData] = client.client.post.mock.calls[0];
        expect(postUrl).toBe('https://adfs.example.com/adfs/ls');
        // Check that credentials and hidden fields were included
        expect(postData).toContain('UserName=ssouser');
        expect(postData).toContain('Password=ssopass');
        expect(postData).toContain('SAMLRequest=base64data');
        expect(postData).toContain('RelayState=');

        // Verify retry was called
        expect(client.client.request).toHaveBeenCalledWith(originalRequest);
        expect(result.data).toBe(successData);
    });

    test('follows redirects to reach login page', async () => {
        const originalRequest = { url: 'https://server.example.com/rm/resources/1', method: 'get', headers: {} };
        const idpUrl = 'https://adfs.example.com/adfs/ls?step=1';

        let getCalls = 0;
        client.client.get = jest.fn(async (url) => {
            getCalls++;
            if (getCalls === 1) {
                // First call: redirect
                return {
                    status: 302,
                    headers: { location: 'https://adfs.example.com/adfs/ls?step=2' },
                    data: '',
                };
            }
            // Second call: login page
            return {
                status: 200,
                headers: { 'content-type': 'text/html' },
                data: ADFS_LOGIN_HTML,
            };
        });

        client.client.post = jest.fn(async () => ({
            status: 200,
            headers: {},
            data: '<html>OK</html>',
        }));

        client.client.request = jest.fn(async () => ({
            status: 200,
            headers: {},
            config: originalRequest,
            data: 'success',
        }));

        const result = await client._attemptProgrammaticSso(originalRequest, idpUrl);

        expect(getCalls).toBe(2);
        expect(result.data).toBe('success');
    });

    test('returns null when login form not found in HTML', async () => {
        const originalRequest = { url: 'https://server.example.com/rm/resources/1', method: 'get', headers: {} };
        const idpUrl = 'https://adfs.example.com/adfs/ls';

        client.client.get = jest.fn(async () => ({
            status: 200,
            headers: { 'content-type': 'text/html' },
            data: NO_FORM_HTML,
        }));

        const result = await client._attemptProgrammaticSso(originalRequest, idpUrl);
        expect(result).toBeNull();
    });

    test('returns null when redirect chain exceeds 10 hops', async () => {
        const originalRequest = { url: 'https://server.example.com/rm/resources/1', method: 'get', headers: {} };
        const idpUrl = 'https://adfs.example.com/adfs/ls?hop=0';

        let hopCount = 0;
        client.client.get = jest.fn(async () => {
            hopCount++;
            return {
                status: 302,
                headers: { location: `https://adfs.example.com/adfs/ls?hop=${hopCount}` },
                data: '',
            };
        });

        const result = await client._attemptProgrammaticSso(originalRequest, idpUrl);
        expect(result).toBeNull();
        // Should have stopped at MAX_SSO_REDIRECTS (10) + 1 attempts total
        expect(hopCount).toBeLessThanOrEqual(11);
    });

    test('returns null when credentials are rejected (login page returned again)', async () => {
        const originalRequest = { url: 'https://server.example.com/rm/resources/1', method: 'get', headers: {} };
        const idpUrl = 'https://adfs.example.com/adfs/ls';

        client.client.get = jest.fn(async () => ({
            status: 200,
            headers: { 'content-type': 'text/html' },
            data: ADFS_LOGIN_HTML,
        }));

        // POST returns another login page (credentials rejected)
        client.client.post = jest.fn(async () => ({
            status: 200,
            headers: {},
            data: ADFS_LOGIN_HTML,
        }));

        const result = await client._attemptProgrammaticSso(originalRequest, idpUrl);
        expect(result).toBeNull();
    });

    test('_parseLoginForm extracts form action and fields from ADFS HTML', () => {
        const form = client._parseLoginForm(ADFS_LOGIN_HTML, 'https://adfs.example.com/adfs/ls');
        expect(form).not.toBeNull();
        expect(form.action).toBe('https://adfs.example.com/adfs/ls');
        expect(form.fields.SAMLRequest).toBe('base64data');
        expect(form.fields.RelayState).toBe('https://server/rm');
        expect(form.usernameField).toBe('UserName');
        expect(form.passwordField).toBe('Password');
    });

    test('_parseLoginForm extracts form action and fields from Keycloak HTML', () => {
        const form = client._parseLoginForm(KEYCLOAK_LOGIN_HTML, 'https://keycloak.example.com/auth/realms/master');
        expect(form).not.toBeNull();
        expect(form.action).toBe('https://keycloak.example.com/auth/realms/master/login-actions/authenticate?session_code=abc123');
        expect(form.fields.csrf_token).toBe('xyz789');
        expect(form.usernameField).toBe('username');
        expect(form.passwordField).toBe('password');
    });

    test('_parseLoginForm resolves relative form action URL', () => {
        const html = `<html><body>
<form method="POST" action="/login/submit">
  <input type="text" name="user" />
  <input type="password" name="pass" />
</form>
</body></html>`;
        const form = client._parseLoginForm(html, 'https://idp.example.com/login');
        expect(form).not.toBeNull();
        expect(form.action).toBe('https://idp.example.com/login/submit');
    });

    test('_parseLoginForm returns null for HTML without password field', () => {
        const form = client._parseLoginForm(NO_FORM_HTML, 'https://example.com');
        expect(form).toBeNull();
    });

    test('_isLoginPage detects password input', () => {
        expect(client._isLoginPage(ADFS_LOGIN_HTML)).toBe(true);
        expect(client._isLoginPage(KEYCLOAK_LOGIN_HTML)).toBe(true);
        expect(client._isLoginPage(NO_FORM_HTML)).toBe(false);
        expect(client._isLoginPage('<input type="password" />')).toBe(true);
        expect(client._isLoginPage("<input type='password' />")).toBe(true);
    });
});
