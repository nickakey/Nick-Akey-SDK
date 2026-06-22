import { LotrNotFoundError } from '../errors.js';
import type { HttpClient } from '../http.js';
import { normalizeDocument, toPage, type RawPage } from '../internal.js';
import { buildQuery } from '../query.js';
import type { ListOptions, Page } from '../types/query.js';

/**
 * Shared behavior for a resource collection: `list`, `get`, and `listAll`.
 * Concrete resources (e.g. {@link Movies}) extend this with just a path; any
 * endpoint-specific routes live on the subclass.
 *
 * Adding a new resource is intentionally trivial:
 * `class Characters extends BaseResource<Character> { constructor(http) { super(http, '/character'); } }`
 */
export class BaseResource<T> {
  constructor(
    protected readonly http: HttpClient,
    protected readonly path: string,
  ) {}

  /** Fetch one page of documents matching `options`. */
  async list(options: ListOptions<T> = {}): Promise<Page<T>> {
    const raw = await this.http.request<RawPage>(this.path, buildQuery(options));
    return toPage<T>(raw);
  }

  /** Fetch a single document by id. Throws {@link LotrNotFoundError} if none matches. */
  async get(id: string): Promise<T> {
    const raw = await this.http.request<RawPage>(`${this.path}/${encodeURIComponent(id)}`);
    const doc = raw.docs?.[0];
    if (!doc) {
      throw new LotrNotFoundError(`No document found at ${this.path}/${id}.`, {
        statusCode: 404,
        url: `${this.path}/${id}`,
      });
    }
    return normalizeDocument<T>(doc);
  }

  /**
   * Lazily iterate every document across all pages, fetching the next page only
   * as it's consumed. Sequential by design — gentle on the API's rate limit.
   *
   * @example
   * for await (const movie of lotr.movies.listAll()) { ... }
   */
  async *listAll(options: ListOptions<T> = {}): AsyncGenerator<T> {
    let page = options.page ?? 1;
    for (;;) {
      const result = await this.list({ ...options, page });
      yield* result.results;
      if (result.results.length === 0 || page >= result.pages) break;
      page += 1;
    }
  }
}
