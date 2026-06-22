# lotr-sdk

A typed TypeScript SDK for the [Lord of the Rings API](https://the-one-api.dev/) (`the-one-api.dev`). Covers the **movie** and **quote** endpoints with first-class filtering, sorting, pagination, automatic retries, and auto-pagination.

- **Type-safe filtering** — a field-aware filter built on MongoDB's familiar operator vocabulary (`$gte`, `$in`, `$exists`, regex…), with autocomplete and compile-time checking.
- **Zero runtime dependencies** — built on native `fetch`.
- **Production-minded** — typed errors, retry-with-backoff that respects `Retry-After`, and auto-pagination.
- **Server-side by design** — the API key is a full-access secret; keep it off the browser.

> This is a take-home exercise project and is not published to npm.

## Install

```bash
npm install   # installs dev toolchain from this repo; this package is not published
npm run build
```

Requires **Node 18+** (for native `fetch`).

## Quick start

Get an API key at [the-one-api.dev/sign-up](https://the-one-api.dev/sign-up).

```ts
import { Lotr } from 'lotr-sdk';

const lotr = new Lotr({ apiKey: process.env.LOTR_API_KEY });

const movies = await lotr.movies.list({
  filter: { academyAwardWins: { $gte: 1 } },
  sort: { boxOfficeRevenueInMillions: 'desc' },
  limit: 5,
});

console.log(movies.results); // Movie[]
console.log(`${movies.results.length} of ${movies.total}`);
```

The `apiKey` falls back to `process.env.LOTR_API_KEY` if you omit it:

```ts
const lotr = new Lotr(); // uses LOTR_API_KEY
```

## Resources

```ts
await lotr.movies.list(options); // GET /movie
await lotr.movies.get(id); // GET /movie/{id}
await lotr.movies.quotes(id, options); // GET /movie/{id}/quote
await lotr.movies.listAll(options); // auto-paginated async iterator

await lotr.quotes.list(options); // GET /quote
await lotr.quotes.get(id); // GET /quote/{id}
```

## Filtering

Filters are objects keyed by the resource's fields. The value's shape decides the operator:

| You write                             | Means          | Sends                   |
| ------------------------------------- | -------------- | ----------------------- |
| `{ name: 'Gandalf' }`                 | equals         | `name=Gandalf`          |
| `{ name: { $ne: 'Frodo' } }`          | not equal      | `name!=Frodo`           |
| `{ race: ['Hobbit', 'Human'] }`       | one of (`$in`) | `race=Hobbit,Human`     |
| `{ race: { $nin: ['Orc'] } }`         | none of        | `race!=Orc`             |
| `{ budgetInMillions: { $gt: 100 } }`  | comparison     | `budgetInMillions>100`  |
| `{ runtimeInMinutes: { $gte: 160 } }` | comparison     | `runtimeInMinutes>=160` |
| `{ name: { $exists: true } }`         | field present  | `name`                  |
| `{ name: { $exists: false } }`        | field absent   | `!name`                 |
| `{ name: /towers/i }`                 | regex match    | `name=/towers/i`        |
| `{ name: { $not: /^The/ } }`          | negated regex  | `name!=/^The/`          |

Filters are **field-aware**: comparison operators are only offered on numeric fields, regex only on string fields, and a value must match its field's type — so `{ budgetInMillions: '100' }` is a compile error.

```ts
const epics = await lotr.movies.list({
  filter: {
    runtimeInMinutes: { $gte: 160 },
    academyAwardWins: { $gt: 0 },
    name: /the/i,
  },
});
```

> The operators are typed to the SDK's supported set — this is **not** a general MongoDB passthrough. `$or`, `$elemMatch`, etc. are intentionally not exposed (see [`design.md`](./design.md)).

## Sorting & pagination

```ts
await lotr.movies.list({
  sort: { boxOfficeRevenueInMillions: 'desc' }, // field:asc | field:desc
  limit: 10,
  page: 2,
});
```

A `list()` result is a `Page<T>`:

```ts
interface Page<T> {
  results: T[]; // the documents
  total: number; // total across all pages
  limit: number;
  offset: number;
  page: number;
  pages: number;
}
```

### Auto-pagination

`listAll()` returns an async iterator that lazily walks every page (sequential, to stay under the rate limit):

```ts
for await (const movie of lotr.movies.listAll({ filter: { academyAwardWins: { $gte: 1 } } })) {
  console.log(movie.name);
}
```

## Errors

Every failure is a typed subclass of `LotrError`, so you can branch on it with `instanceof`:

```ts
import { LotrNotFoundError, LotrRateLimitError } from 'lotr-sdk';

try {
  await lotr.movies.get('does-not-exist');
} catch (error) {
  if (error instanceof LotrNotFoundError) {
    /* 404 */
  }
  if (error instanceof LotrRateLimitError) {
    /* 429 — error.retryAfter */
  }
}
```

| Class                     | When                                 |
| ------------------------- | ------------------------------------ |
| `LotrAuthenticationError` | 401 — bad/missing key                |
| `LotrPermissionError`     | 403                                  |
| `LotrNotFoundError`       | 404 / empty single-document response |
| `LotrInvalidRequestError` | 400 / 422                            |
| `LotrRateLimitError`      | 429 (carries `retryAfter`)           |
| `LotrConnectionError`     | network failure (no response)        |
| `LotrAPIError`            | 5xx / anything else                  |

Transient failures (429, 5xx, network) are retried automatically with exponential backoff and jitter, honoring `Retry-After`. Tune or disable it:

```ts
new Lotr({ apiKey, maxRetries: 0 }); // default is 2
```

## Configuration

```ts
new Lotr({
  apiKey, // or LOTR_API_KEY
  baseUrl: 'https://…', // e.g. a proxy; defaults to the public API
  fetch: customFetch, // inject a custom fetch
  maxRetries: 2, // 0 disables retries
});
```

## Testing

```bash
npm test                 # unit tests — fully mocked, no network or key needed
npm run test:integration # live tests against the real API (needs LOTR_API_KEY)
```

Unit tests stub `fetch` (no network-intercept library) and use fake timers for the retry/backoff logic. The integration suite self-skips when no key is present.

## Demo

```bash
cp .env.example .env   # then add your key
npm run demo
```

## Scripts

| Script                     | Does                                |
| -------------------------- | ----------------------------------- |
| `npm run build`            | Bundle ESM + CJS + types (`tsdown`) |
| `npm run typecheck`        | `tsc --noEmit`                      |
| `npm run lint`             | ESLint                              |
| `npm test`                 | Unit tests                          |
| `npm run test:integration` | Live API tests                      |
| `npm run demo`             | Run the demo                        |

## Security

The API key is a full-access bearer secret, so this SDK is **server-side only** — never ship the key to a browser. The key is held in memory only (never written to disk or logged), and the `Authorization` header is redacted from any error. For browser use, put a backend proxy in front that holds the key.
