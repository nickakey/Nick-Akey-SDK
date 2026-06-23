/**
 * lotr-sdk — a typed client for the Lord of the Rings API (the-one-api.dev).
 *
 * @example
 * import { Lotr } from 'lotr-sdk';
 *
 * const lotr = new Lotr({ apiKey: process.env.LOTR_API_KEY });
 * const oscarWinners = await lotr.movies.list({
 *   filter: { academyAwardWins: { $gte: 1 } },
 *   sort: { field: 'boxOfficeRevenueInMillions', direction: 'desc' },
 * });
 */

export { Lotr, type LotrOptions } from './client.js';
export type { FetchLike } from './http.js';

// Resource classes (useful for typing; instances are created by `Lotr`).
export { BaseResource } from './resources/base.js';
export { Movies } from './resources/movies.js';
export { Quotes } from './resources/quotes.js';

// Models.
export type { Movie, Quote } from './types/models.js';

// Query types.
export type {
  Filter,
  FilterValue,
  NumberOperators,
  StringOperators,
  Sort,
  SortDirection,
  ListOptions,
  PaginationOptions,
  Page,
} from './types/query.js';

// Errors.
export {
  LotrError,
  LotrAuthenticationError,
  LotrPermissionError,
  LotrNotFoundError,
  LotrInvalidRequestError,
  LotrRateLimitError,
  LotrConnectionError,
  LotrAPIError,
} from './errors.js';

// The query serializer is exported as a utility (and for advanced/manual use).
export { buildQuery } from './query.js';
