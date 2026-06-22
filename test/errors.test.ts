import { describe, expect, it } from 'vitest';
import {
  LotrAPIError,
  LotrAuthenticationError,
  LotrError,
  LotrInvalidRequestError,
  LotrNotFoundError,
  LotrPermissionError,
  LotrRateLimitError,
  errorFromResponse,
} from '../src/errors';

const url = 'https://the-one-api.dev/v2/movie';

function build(status: number, body: unknown = undefined, headers: HeadersInit = {}) {
  return errorFromResponse(status, url, new Headers(headers), body);
}

describe('errorFromResponse', () => {
  it.each([
    [401, LotrAuthenticationError],
    [403, LotrPermissionError],
    [404, LotrNotFoundError],
    [400, LotrInvalidRequestError],
    [422, LotrInvalidRequestError],
    [429, LotrRateLimitError],
    [500, LotrAPIError],
    [503, LotrAPIError],
    [418, LotrAPIError],
  ])('maps status %i to the right subclass', (status, expectedClass) => {
    const error = build(status);
    expect(error).toBeInstanceOf(expectedClass);
    expect(error).toBeInstanceOf(LotrError); // every subclass is a LotrError
    expect(error.statusCode).toBe(status);
    expect(error.url).toBe(url);
  });

  it('carries the API message from the response body', () => {
    const error = build(401, { success: false, message: 'Invalid or missing token' });
    expect(error.message).toBe('Invalid or missing token');
  });

  it('falls back to a default message when the body has none', () => {
    expect(build(429).message).toMatch(/rate limit/i);
  });

  it('parses Retry-After (seconds) onto the rate-limit error', () => {
    const error = build(429, undefined, { 'retry-after': '30' }) as LotrRateLimitError;
    expect(error).toBeInstanceOf(LotrRateLimitError);
    expect(error.retryAfter).toBe(30);
  });

  it('leaves retryAfter undefined when the header is absent', () => {
    const error = build(429) as LotrRateLimitError;
    expect(error.retryAfter).toBeUndefined();
  });

  it('error name reflects the subclass (useful in logs)', () => {
    expect(build(404).name).toBe('LotrNotFoundError');
  });
});
