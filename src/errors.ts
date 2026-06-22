/**
 * Typed error hierarchy, modeled on stripe-node's. A single base class carries
 * shared context (status, url, response body); subclasses let callers branch on
 * failure mode with `instanceof` instead of inspecting status codes.
 */

export interface LotrErrorOptions {
  statusCode?: number;
  /** Stable, machine-readable code (e.g. `missing_api_key`, `connection_error`). */
  code?: string;
  url?: string;
  /** Response headers, with `Authorization` redacted. */
  headers?: Headers;
  /** Parsed response body, when available. */
  body?: unknown;
}

/** Base class for every error thrown by the SDK. */
export class LotrError extends Error {
  readonly statusCode?: number;
  readonly code?: string;
  readonly url?: string;
  readonly headers?: Headers;
  readonly body?: unknown;

  constructor(message: string, options: LotrErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.url = options.url;
    this.headers = options.headers;
    this.body = options.body;
    // Keep `instanceof` working when compiled down to older targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Invalid or missing API key (HTTP 401). */
export class LotrAuthenticationError extends LotrError {}

/** Authenticated but not allowed (HTTP 403). */
export class LotrPermissionError extends LotrError {}

/** Resource does not exist (HTTP 404, or an empty single-document response). */
export class LotrNotFoundError extends LotrError {}

/** Malformed request (HTTP 400/422). */
export class LotrInvalidRequestError extends LotrError {}

/** Network-level failure — no HTTP response was received. */
export class LotrConnectionError extends LotrError {}

/** Server error or any otherwise-unmapped status (HTTP 5xx / fallback). */
export class LotrAPIError extends LotrError {}

/** Rate limit exceeded (HTTP 429). The 100-req/10-min ceiling on this API. */
export class LotrRateLimitError extends LotrError {
  /** Seconds to wait before retrying, from the `Retry-After` header (if sent). */
  readonly retryAfter?: number;

  constructor(message: string, options: LotrErrorOptions & { retryAfter?: number } = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }
}

/** Construct the appropriate error subclass from a failed HTTP response. */
export function errorFromResponse(
  statusCode: number,
  url: string,
  headers: Headers,
  body: unknown,
): LotrError {
  const message = messageFromBody(body) ?? defaultMessage(statusCode);
  const options: LotrErrorOptions = { statusCode, url, headers, body };

  switch (statusCode) {
    case 401:
      return new LotrAuthenticationError(message, options);
    case 403:
      return new LotrPermissionError(message, options);
    case 404:
      return new LotrNotFoundError(message, options);
    case 429:
      return new LotrRateLimitError(message, {
        ...options,
        retryAfter: parseRetryAfterSeconds(headers),
      });
    case 400:
    case 422:
      return new LotrInvalidRequestError(message, options);
    default:
      return new LotrAPIError(message, options);
  }
}

/** Pull a human message out of the API's `{ message }` error body, if present. */
function messageFromBody(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return undefined;
}

function defaultMessage(statusCode: number): string {
  switch (statusCode) {
    case 401:
      return 'Authentication failed. Check your API key.';
    case 403:
      return 'Not permitted to access this resource.';
    case 404:
      return 'Resource not found.';
    case 429:
      return 'Rate limit exceeded (100 requests per 10 minutes).';
    default:
      return `Request failed with status ${statusCode}.`;
  }
}

function parseRetryAfterSeconds(headers: Headers): number | undefined {
  const value = headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : undefined;
}
