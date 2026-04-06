/**
 * Unit tests for OSLCClient constructor auth options (cookieJar, ssoCallback).
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
const { default: OSLCClient } = await import('../OSLCClient.js');

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
