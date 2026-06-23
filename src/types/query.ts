/**
 * Types describing how callers query a resource: filtering, sorting, pagination,
 * and the shape of a returned page.
 *
 * Since the code for the actual API uses ` mongoose-query-parser ` under thehood, I  deliberately borrowing from MongoDB's operator vocabulary instead of creating something new
 * E.G. (`$gt`, `$in`, `$exists`, …) rather than inventing a new one,
 *
 *
 * filters are *type-aware*:
 * E.G.
 *  - comparison operators are only offered on numeric fields,
 *    regex only on string fields,
 *    and every value is typed against its individual field.
 */

/** Operators available on a numeric field. */
export interface NumberOperators {
  $eq?: number;
  $ne?: number;
  $gt?: number;
  $gte?: number;
  $lt?: number;
  $lte?: number;
  $in?: number[];
  $nin?: number[];
  $exists?: boolean;
}

/** Operators available on a string field. */
export interface StringOperators {
  $eq?: string;
  $ne?: string;
  $in?: string[];
  $nin?: string[];
  /** Negated regex match — documents whose field does *not* match. */
  $not?: RegExp;
  $exists?: boolean;
}

/**
 * The conditions accepted for a field of value-type `V`. Shorthands:
 * a bare scalar means equality, an array means `$in`, and (for strings) a bare
 * `RegExp` means a regex match.
 */
export type FilterValue<V> = V extends number
  ? number | number[] | NumberOperators
  : V extends string
    ? string | string[] | RegExp | StringOperators
    : never;

/** A type-safe filter over a resource `T`: keys are `T`'s fields. */
export type Filter<T> = {
  [K in keyof T]?: FilterValue<T[K]>;
};

export type SortDirection = 'asc' | 'desc';

/**
 * Sort specification. The API supports a single sort field, so this models
 * exactly one — the type makes that limit visible rather than silently dropping
 * extra fields.
 *
 * @example
 * { field: 'boxOfficeRevenueInMillions', direction: 'desc' }
 */
export interface Sort<T> {
  field: keyof T;
  /** Defaults to `'asc'`. */
  direction?: SortDirection;
}

/** Pagination controls common to every list call. */
export interface PaginationOptions {
  /** Page size (the API defaults to a large value when omitted). */
  limit?: number;
  /** 1-based page number. */
  page?: number;
  /** Number of documents to skip. */
  offset?: number;
}

/** Options accepted by `list()` / `listAll()`. */
export interface ListOptions<T> extends PaginationOptions {
  filter?: Filter<T>;
  sort?: Sort<T>;
}

/** A single page of results plus the API's pagination metadata. */
export interface Page<T> {
  /** The documents on this page (the API's `docs`). */
  results: T[];
  /** Total number of documents matching the query, across all pages. */
  total: number;
  limit: number;
  offset: number;
  /** 1-based page number this result represents. */
  page: number;
  /** Total number of pages available. */
  pages: number;
}
