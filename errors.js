/*
 * Typed errors for OSLC HTTP operations.
 *
 * The axios client uses validateStatus: 401 || < 400, so non-401 error
 * statuses surface as axios rejections carrying error.response. oslcErrorFrom
 * accepts either that rejection shape or a resolved response object and maps
 * it to the appropriate subclass so callers can switch on error type.
 */

export class OSLCError extends Error {
  constructor(message, { status = null, statusText = null, serverMessage = null, url = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'OSLCError';
    this.status = status;
    this.statusText = statusText;
    this.serverMessage = serverMessage;
    this.url = url;
  }
}

export class PreconditionFailedError extends OSLCError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'PreconditionFailedError';
  }
}

export class ConflictError extends OSLCError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ConflictError';
  }
}

/**
 * The host supplied a credential and the server rejected it.
 *
 * Distinct from AUTH_EXHAUSTED, which means "none of the built-in mechanisms worked".
 * This means "the credential you gave me is not accepted", which is what a host needs in
 * order to prompt for a new one rather than retry blindly.
 */
export class CredentialRejectedError extends OSLCError {
  constructor(message, { wwwAuthenticate = null, ...options } = {}) {
    super(message, options);
    this.name = 'CredentialRejectedError';
    this.wwwAuthenticate = wwwAuthenticate;
  }
}

/**
 * Build the appropriate OSLCError subclass from an axios rejection or a
 * resolved response object.
 *
 * @param {Error|Object} errorOrResponse - axios error (with .response) or response-like object
 * @param {string} url - the request URL, for the error message and .url field
 * @param {string} defaultMessage - operation description, e.g. 'Failed to update resource'
 * @returns {OSLCError}
 */
export function oslcErrorFrom(errorOrResponse, url, defaultMessage) {
  if (errorOrResponse instanceof OSLCError) return errorOrResponse;
  const response = errorOrResponse?.response ?? errorOrResponse;
  const status = typeof response?.status === 'number' ? response.status : null;
  const statusText = response?.statusText ?? null;
  let serverMessage = null;
  if (typeof response?.data === 'string' && response.data.length) {
    serverMessage = response.data;
  } else if (response?.data != null && typeof response.data === 'object') {
    serverMessage = JSON.stringify(response.data);
  }
  const statusPart = status ? ` (${status}${statusText ? ' ' + statusText : ''})` : '';
  const message = `${defaultMessage}${statusPart}: ${url}`;
  const options = {
    status, statusText, serverMessage, url,
    cause: errorOrResponse instanceof Error ? errorOrResponse : null
  };
  if (status === 412) return new PreconditionFailedError(message, options);
  if (status === 409) return new ConflictError(message, options);
  return new OSLCError(message, options);
}
