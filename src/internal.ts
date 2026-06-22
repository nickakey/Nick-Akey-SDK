import type { Page } from './types/query.js';

/**
 * Internal helpers for translating the API's raw wire format into our models.
 * Not part of the public API.
 */

/** The envelope every list endpoint returns. */
export interface RawPage {
  docs: RawDocument[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  pages: number;
}

/** A raw API document — arbitrary fields plus Mongo's `_id`. */
export type RawDocument = Record<string, unknown> & { _id: string };

/** Map a raw document to a model: rename `_id` → `id`, keep everything else. */
export function normalizeDocument<T>(raw: RawDocument): T {
  const { _id, ...rest } = raw;
  return { ...rest, id: _id } as T;
}

/** Map a raw envelope to a typed {@link Page}. */
export function toPage<T>(raw: RawPage): Page<T> {
  return {
    results: raw.docs.map((doc) => normalizeDocument<T>(doc)),
    total: raw.total,
    limit: raw.limit,
    offset: raw.offset,
    page: raw.page,
    pages: raw.pages,
  };
}
