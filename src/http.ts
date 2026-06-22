import { LotrConnectionError, errorFromResponse } from './errors.js';

/** Any `fetch`-compatible function. Lets callers inject a custom client (or a test stub). */
export type FetchLike = typeof fetch;

export interface HttpClientConfig {
  apiKey: string;
  baseUrl: string;
  fetch: FetchLike;
  /** Max automatic retries for transient failures (429 / 5xx / network). */
  maxRetries: number;
}

const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * The single place that talks to the network. Owns auth, JSON handling, error
 * mapping, and retry-with-backoff. Every SDK call is a `GET`, so retries are
 * unconditionally safe and need no idempotency keys.
 *
 * The API key is held in a private field and never stored elsewhere or attached
 * to errors, so it can't leak through logging or serialization.
 */
export class HttpClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #maxRetries: number;

  constructor(config: HttpClientConfig) {
    this.#apiKey = config.apiKey;
    this.#baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.#fetch = config.fetch;
    this.#maxRetries = config.maxRetries;
  }

  /** GET `path` (optionally with a pre-built query string) and parse JSON as `T`. */
  async request<T>(path: string, query = ''): Promise<T> {
    const url = query ? `${this.#baseUrl}${path}?${query}` : `${this.#baseUrl}${path}`;

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.#fetch(url, {
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            Accept: 'application/json',
          },
        });
      } catch (cause) {
        // No response at all (DNS, TLS, socket). Retry, then surface.
        if (attempt < this.#maxRetries) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new LotrConnectionError(`Network request to ${url} failed: ${errorMessage(cause)}`, {
          url,
          code: 'connection_error',
        });
      }

      if (response.ok) {
        return (await response.json()) as T;
      }

      if (isRetryableStatus(response.status) && attempt < this.#maxRetries) {
        await sleep(backoffMs(attempt, retryAfterMs(response.headers)));
        continue;
      }

      const body = await readBody(response);
      throw errorFromResponse(response.status, url, redactHeaders(response.headers), body);
    }
  }
}

/** Transient statuses worth retrying: rate limit and server errors. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Exponential backoff with jitter (stripe-node's formula): grow the delay
 * geometrically, randomize it to 50–100% to avoid thundering herds, floor it at
 * the initial delay, and — when the server sent `Retry-After` — wait at least
 * that long (capped at 60s).
 */
export function backoffMs(
  attempt: number,
  retryAfterMillis?: number,
  random: () => number = Math.random,
): number {
  let delay = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
  delay *= 0.5 * (1 + random());
  delay = Math.max(INITIAL_RETRY_DELAY_MS, delay);
  if (retryAfterMillis !== undefined) {
    delay = Math.min(Math.max(delay, retryAfterMillis), MAX_RETRY_AFTER_MS);
  }
  return delay;
}

function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds * 1_000 : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Read the body defensively: prefer JSON, fall back to text, tolerate empty. */
async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Defensive: never let an `Authorization` value ride along on an error. */
function redactHeaders(headers: Headers): Headers {
  const clone = new Headers(headers);
  if (clone.has('authorization')) clone.set('authorization', 'REDACTED');
  return clone;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
