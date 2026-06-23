# Design

This document explains how the SDK is built and why. The brief was to wrap the movie and quote endpoints of [the-one-api.dev](https://the-one-api.dev/), "as if you were implementing all the endpoints" — so the design optimizes for clarity, extensibility, and production-readiness over covering the literal five routes.

## The TLDR:
- I borrowed SDK conventions from the great stripe-sdk
- The design of this SDK is meant to 
  1: Make adding new resources very easy (just extend BaseResource) and still flexible ( see nesting quotes within movies )
  2: Make the typing really great and automatic for the developer. (Even the filters are typed)
- On filtering, I decided to try and keep it as close to mongodb conventions as possible, since that's what they API is using under the hood
- There is some automatic retrying & sensible handling of rate limits
- zero runtime depedencies

## Architecture

A single `Lotr` client exposes resource namespaces, each backed by a generic base class:

```
Lotr
├── movies: Movies  ─┐
└── quotes: Quotes  ─┴── extends BaseResource<T>  ──►  HttpClient  ──►  fetch
```

- **`Lotr`** validates configuration and wires up resources. It holds no network logic.
- **`BaseResource<T>`** owns the behavior every collection shares: `list`, `get`, and `listAll`. It handles query building, envelope unwrapping, and `_id → id` normalization in one place.
- **`Movies` / `Quotes`** are thin — a path and any endpoint-specific routes. `Movies` adds `quotes(id)` for the nested `/movie/{id}/quote` route, mirroring the API's own hierarchy.
- **`HttpClient`** is the single point that touches the network: auth, JSON, error mapping, and retries.

This keeps the layers honest and makes the SDK easy to extend. **Adding a resource is ~5 lines** — the whole reason for the generic base:

```ts
class Characters extends BaseResource<Character> {
  constructor(http: HttpClient) {
    super(http, '/character');
  }
}
```

Its `Filter<Character>`, `Page<Character>`, sorting, pagination, errors, and retries all come for free.

## Type-safe filtering

Filtering is the centerpiece. The goal was a surface that is **ergonomic, fully typed, and a faithful mirror of the API's real contract**.

### Borrowing MongoDB's vocabulary

Rather than invent a query DSL, the filter object reuses MongoDB's operator names (`$gt`, `$in`, `$exists`, …). Anyone who has used Mongo, Mongoose, or Prisma reads it without a manual, and it maps cleanly onto what the API accepts. Shorthands keep common cases terse: a bare scalar is equality, an array is `$in`, and a bare `RegExp` is a regex match.

### Field-aware typing

`Filter<T>` is derived generically from the model interface, so each operator is only offered where it makes sense:

```ts
type FilterValue<V> = V extends number
  ? number | number[] | NumberOperators
  : V extends string
    ? string | string[] | RegExp | StringOperators
    : never;

type Filter<T> = { [K in keyof T]?: FilterValue<T[K]> };
```

This enforces three things at compile time: comparison operators (`$gt`/`$lt`/…) only on numeric fields, regex only on strings, and **values must match their field's type**. The last point matters because the server auto-coerces values (`"100"` → `100`); typing the values prevents a whole class of silent bugs before a request is ever sent. Because `Filter<T>` is generic, this costs nothing per resource — a new model is correctly typed automatically.

### Documented contract, not implementation detail

The API delegates query parsing to the `mongoose-query-parser` library, which can technically do more than the docs describe (`$or` via a JSON `filter` param, forced casts, nested paths) — and the API silently discards still other capabilities it parses (`select`, `populate`, `distinct`). The SDK deliberately exposes **only the documented operator set**: `$eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $exists`, regex, and negated regex.

The reasoning: undocumented parser behavior is an implementation detail the API could change without considering it a breaking change. An SDK should insulate its users from the API's internals, not couple them to it. Modeling `select`/`populate` would be worse still — those are no-ops server-side. This keeps the surface honest: everything the SDK offers actually works and is contractually supported.

### The wire format

The serializer, `buildQuery()`, is a pure function and the most-tested unit in the codebase. Getting it right required reading the API's source: it runs `qs.parse()` (which URL-decodes) **before** detecting operators. So the query string must carry operators **literally** while percent-encoding values:

```
{ budgetInMillions: { $gt: 100 } }          →  budgetInMillions>100
{ name: 'The Two Towers' }                  →  name=The%20Two%20Towers
{ race: { $in: ['Hobbit', 'Human'] } }      →  race=Hobbit,Human
{ name: { $exists: false } }                →  !name
{ name: /towers/i }                         →  name=/towers/i
```

`URLSearchParams` can't express this (it would encode the operators and append stray `=`), so the string is built by hand. Keeping `buildQuery()` a small, dependency-free pure function makes it exhaustively unit-testable — every operator is asserted against its exact output.

## Pagination

Every list response is the API's `{ docs, total, limit, offset, page, pages }` envelope. The SDK exposes it as a `Page<T>` (renaming `docs` → `results`) rather than returning a bare array — callers need `total`/`pages` to build their own paginators.

On top of that, `listAll()` is an async iterator that lazily walks all pages:

```ts
for await (const movie of lotr.movies.listAll()) { ... }
```

This is the one "abstraction over the raw API" worth adding (auto-pagination is a well-trodden pattern — Stripe, Octokit, the OpenAI SDK all do it). It's deliberately **sequential and lazy** — it fetches the next page only as the previous one is consumed — which keeps it gentle on the rate limit.

## Errors and retries

Errors follow stripe-node's model: a base `LotrError` carries shared context (status, URL, body), and status-routed subclasses let callers branch with `instanceof` instead of inspecting status codes. A factory maps each HTTP status to its subclass.

Transient failures — `429`, `5xx`, and network errors — are retried automatically with exponential backoff and jitter, honoring the `Retry-After` header (capped at 60s) and bounded by a configurable `maxRetries` (default 2).

One simplification falls out of the read-only surface: **every SDK call is a `GET`**, so retries are unconditionally safe and need no idempotency keys (which stripe-node requires for `POST`s). The 429 handling is the most valuable retry path here, given the API's 100-requests-per-10-minutes limit.

## Response trust

The SDK trusts the API contract rather than re-validating responses at runtime (no zod). Runtime validation earns its keep when wrapping a volatile, third-party-controlled API — there it fails fast and loud at the boundary. For a stable, well-specified API, it would mostly duplicate a contract better owned in one place (the types), at the cost of a dependency and a schema to keep in sync. The types are hand-written and treated as the source of truth; the single normalization is `_id → id`.

If this SDK later wrapped a less stable API, the clean extension is to offer zod as an _optional_ peer dependency (as the OpenAI SDK does), so validation is opt-in without forcing the dependency on everyone.

## Zero runtime dependencies

The SDK ships with **no runtime dependencies**, built entirely on native `fetch` (Node 18+). This is the modern best practice — Stripe's and OpenAI's Node SDKs both ship zero runtime deps — and it's genuinely achievable here because the problem is small: a tiny surface, all `GET`s, a static bearer token, and query building that `URLSearchParams`-style hand-rolling handles. The one piece of real logic (`buildQuery`) is small enough that owning and testing it directly beats any dependency.

`fetch` is injectable via the client config, which serves three purposes: mocking HTTP in tests without a network-intercept library, supporting custom agents/proxies, and a fallback for older runtimes.

## Security

The API key is a full-access bearer secret (unlike, say, Supabase's anon key, where authorization is enforced server-side and the key is just an identifier). So:

- **The SDK is server-side by design.** Browser use would leak the key; the documented path for that is a backend proxy holding the key.
- **The key is memory-only** — passed to the `HttpClient` private field, never written to disk, cached, or stored on the `Lotr` instance.
- **The `Authorization` header is redacted** from any error before it's attached, so logging a caught error can't leak the key.

## Testing

The default `npm test` suite is fully mocked and hermetic — no network, no key — so it runs anywhere, including CI. It stubs `fetch` directly (no `nock`/`msw`), which the injectable-`fetch` design makes trivial, and uses fake timers to test backoff math without real sleeps.

Coverage centers on the riskiest units: `buildQuery` (every operator → exact query string), the error factory (status → class + fields), the retry/backoff logic (triggers, `Retry-After`, `maxRetries`), and the resource methods (URL construction, envelope unwrapping, normalization, auto-pagination).

A separate, opt-in integration suite (`npm run test:integration`) hits the real API and self-skips when no `LOTR_API_KEY` is present.

## Deliberate non-goals

- **Reference expansion** (hydrating `quote.movie` / `quote.character`): an N+1 pattern against a 100-req/10-min limit — a page of 100 quotes would mean 100+ calls. The server can't do it either (`populate` is discarded). If added, it would need batching, caching, and explicit opt-in.
- **`select` / `populate` / `distinct` / `$or`**: not in the documented contract (see _Type-safe filtering_).
- **Publishing to npm**: out of scope for the exercise.

## Known upstream issues

While testing against the live API I found that **sorting returns HTTP 500 for any field without a database index** — which includes *every* `movie` field and `quote.dialog`. It's not a result-size problem: sorting by `_id` (always indexed) works on every collection, including the 8-document `movies`, while no other `movie` field sorts. The SDK emits the documented `field:asc|desc` format correctly (verified against fields the API *can* sort, e.g. `character?sort=name`), so this is an API-side bug, not the SDK's. I reported it upstream with a full repro: [gitfrosh/lotr-api#228](https://github.com/gitfrosh/lotr-api/issues/228). The SDK surfaces these as a `LotrAPIError` (`statusCode: 500`) rather than masking them.

## Possible next steps

- Optional zod validation as a peer dependency.
- More resources (`/book`, `/character`, `/chapter`) — each ~5 lines on the existing base.
- A `DateOps` filter category, parallel to `NumberOps`, if a date field is ever modeled.
