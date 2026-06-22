import type { HttpClient } from '../http.js';
import type { Quote } from '../types/models.js';
import { BaseResource } from './base.js';

/** The `/quote` resource. */
export class Quotes extends BaseResource<Quote> {
  constructor(http: HttpClient) {
    super(http, '/quote');
  }
}
