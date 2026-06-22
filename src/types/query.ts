/**
 * Types describing how callers query a resource: filtering, sorting, pagination,
 * and the shape of a returned page.
 *
 * The filter surface deliberately borrows MongoDB's operator vocabulary
 * (`$gt`, `$in`, `$exists`, …) rather than inventing a new one, and is
 * *field-aware*: comparison operators are only offered on numeric fields, regex
 * only on string fields, and every value is typed against its field. This is the
 * API's documented contract — not the full capability of its underlying query
 * parser (see design.md).
 */

/** Operators available on a numeric field. */
export interface NumberOperators {
  $eq?: number;
  $ne?: number;
  $gt?: number;
  $gte?: number;
  $lt?: number;
  $lte?: number;
  /** Field value is one of these (`$in`). */
  $in?: number[];
  /** Field value is none of these (`$nin`). */
  $nin?: number[];
  /** Whether the field is present on the document. */
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
 * Sort specification keyed by the resource's fields. The API supports a single
 * sort field; if multiple are given, the first is used.
 */
export type Sort<T> = {
  [K in keyof T]?: SortDirection;
};

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
