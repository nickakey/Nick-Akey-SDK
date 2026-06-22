import { LotrError } from './errors.js';
import { HttpClient, type FetchLike } from './http.js';
import { Movies } from './resources/movies.js';
import { Quotes } from './resources/quotes.js';

export interface LotrOptions {
  /** API key. Falls back to `process.env.LOTR_API_KEY` when omitted. */
  apiKey?: string;
  /** Override the API base URL (e.g. for a proxy). Defaults to the public API. */
  baseUrl?: string;
  /** Custom `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Max automatic retries for transient failures. Defaults to 2; `0` disables. */
  maxRetries?: number;
}

const DEFAULT_BASE_URL = 'https://the-one-api.dev/v2';
const DEFAULT_MAX_RETRIES = 2;

/**
 * Entry point to the SDK.
 *
 * @example
 * const lotr = new Lotr({ apiKey: '...' });
 * const page = await lotr.movies.list({ filter: { academyAwardWins: { $gte: 1 } } });
 */
export class Lotr {
  readonly movies: Movies;
  readonly quotes: Quotes;

  constructor(options: LotrOptions = {}) {
    const apiKey = options.apiKey ?? process.env.LOTR_API_KEY;
    if (!apiKey) {
      throw new LotrError(
        'Missing API key. Pass `new Lotr({ apiKey })` or set LOTR_API_KEY. Get a key at https://the-one-api.dev/sign-up.',
        { code: 'missing_api_key' },
      );
    }

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new LotrError(
        'No global `fetch` found. Use Node 18+ or pass a `fetch` implementation via options.',
        { code: 'missing_fetch' },
      );
    }

    // The key is handed to the HttpClient (private field) and not retained here.
    const http = new HttpClient({
      apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      fetch: fetchImpl,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    });

    this.movies = new Movies(http);
    this.quotes = new Quotes(http);
  }
}
