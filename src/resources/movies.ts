import type { HttpClient } from '../http.js';
import { toPage, type RawPage } from '../internal.js';
import { buildQuery } from '../query.js';
import type { Movie, Quote } from '../types/models.js';
import type { ListOptions, Page } from '../types/query.js';
import { BaseResource } from './base.js';

/** The `/movie` resource, plus its nested quotes route. */
export class Movies extends BaseResource<Movie> {
  constructor(http: HttpClient) {
    super(http, '/movie');
  }

  /**
   * Quotes spoken in a given movie — `GET /movie/{id}/quote`.
   *
   * Lives here (rather than on `quotes`) because the route is movie-rooted,
   * mirroring the API's own hierarchy.
   */
  async quotes(movieId: string, options: ListOptions<Quote> = {}): Promise<Page<Quote>> {
    const path = `/movie/${encodeURIComponent(movieId)}/quote`;
    const raw = await this.http.request<RawPage>(path, buildQuery(options));
    return toPage<Quote>(raw);
  }
}
