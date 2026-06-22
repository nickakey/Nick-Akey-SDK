import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient, backoffMs, isRetryableStatus } from '../src/http';
import {
  LotrAPIError,
  LotrConnectionError,
  LotrRateLimitError,
  type LotrError,
} from '../src/errors';
import { envelope, queuedFetch, response } from './helpers';

function makeClient(fetchStub: ReturnType<typeof queuedFetch>, maxRetries = 2) {
  return new HttpClient({
    apiKey: 'test-key',
    baseUrl: 'https://api.test/v2',
    fetch: fetchStub,
    maxRetries,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('HttpClient.request', () => {
  it('sends the bearer token and parses JSON on success', async () => {
    const fetchStub = queuedFetch([response(200, envelope([{ _id: '1' }]))]);
    const data = await makeClient(fetchStub).request('/movie');

    expect(data).toMatchObject({ total: 1 });
    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v2/movie');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });

  it('appends a pre-built query string', async () => {
    const fetchStub = queuedFetch([response(200, envelope([]))]);
    await makeClient(fetchStub).request('/movie', 'name=Gandalf&limit=2');
    expect(fetchStub.mock.calls[0][0]).toBe('https://api.test/v2/movie?name=Gandalf&limit=2');
  });

  it('retries a 5xx and then succeeds', async () => {
    vi.useFakeTimers();
    const fetchStub = queuedFetch([
      response(500, { message: 'boom' }),
      response(200, envelope([], { total: 0 })),
    ]);
    const promise = makeClient(fetchStub).request('/movie');
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toMatchObject({ total: 0 });
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('retries a 429 (honoring Retry-After) and then succeeds', async () => {
    vi.useFakeTimers();
    const fetchStub = queuedFetch([
      response(429, { message: 'slow down' }, { 'retry-after': '1' }),
      response(200, envelope([])),
    ]);
    const promise = makeClient(fetchStub).request('/movie');
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBeDefined();
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries and throws the mapped error', async () => {
    vi.useFakeTimers();
    const fetchStub = queuedFetch([
      response(500, {}),
      response(500, {}),
      response(500, { message: 'still down' }),
    ]);
    const promise = makeClient(fetchStub, 2).request('/movie');
    const assertion = expect(promise).rejects.toBeInstanceOf(LotrAPIError);
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchStub).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('retries network failures then throws LotrConnectionError', async () => {
    vi.useFakeTimers();
    const fetchStub = queuedFetch([
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
    ]);
    const promise = makeClient(fetchStub, 2).request('/movie');
    const assertion = expect(promise).rejects.toBeInstanceOf(LotrConnectionError);
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchStub).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 4xx (e.g. 404)', async () => {
    const fetchStub = queuedFetch([response(404, { message: 'not found' })]);
    await expect(makeClient(fetchStub).request('/movie/x')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(fetchStub).toHaveBeenCalledOnce();
  });

  it('redacts the Authorization header from a thrown error', async () => {
    // Simulate a server echoing the auth header back on an error response.
    const fetchStub = queuedFetch([
      response(500, { message: 'x' }, { authorization: 'Bearer test-key' }),
    ]);
    await makeClient(fetchStub, 0)
      .request('/movie')
      .catch((error: LotrError) => {
        expect(error.headers?.get('authorization')).toBe('REDACTED');
      });
    expect.assertions(1);
  });

  it('throws a typed rate-limit error carrying retryAfter when retries are disabled', async () => {
    const fetchStub = queuedFetch([response(429, { message: 'slow' }, { 'retry-after': '42' })]);
    await expect(makeClient(fetchStub, 0).request('/movie')).rejects.toMatchObject({
      retryAfter: 42,
    });
    await expect(
      makeClient(queuedFetch([response(429, {})]), 0).request('/movie'),
    ).rejects.toBeInstanceOf(LotrRateLimitError);
  });
});

describe('isRetryableStatus', () => {
  it('treats 429 and 5xx as retryable, others not', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe('backoffMs', () => {
  it('floors at the initial delay regardless of jitter', () => {
    expect(backoffMs(0, undefined, () => 0)).toBe(500);
    expect(backoffMs(0, undefined, () => 1)).toBe(500);
  });

  it('grows geometrically with the attempt', () => {
    expect(backoffMs(1, undefined, () => 1)).toBe(1000);
    expect(backoffMs(2, undefined, () => 1)).toBe(2000);
  });

  it('caps the base delay at the max', () => {
    // attempt 5 would be 500 * 2^5 = 16000, capped to 5000
    expect(backoffMs(5, undefined, () => 1)).toBe(5000);
  });

  it('waits at least Retry-After, capped at 60s', () => {
    expect(backoffMs(0, 30_000, () => 0)).toBe(30_000);
    expect(backoffMs(0, 120_000, () => 0)).toBe(60_000);
  });
});
