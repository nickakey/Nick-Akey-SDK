import type { Filter, ListOptions, Sort } from './types/query.js';

/**
 * Serialize list options into the-one-api's query-string dialect.
 *
 * This is the heart of the SDK's filtering. The API delegates query parsing to
 * `mongoose-query-parser`, which runs `qs.parse()` (URL-decoding) *before* it
 * detects operators. So the wire format is: operators emitted **literally**
 * (e.g. `budgetInMillions>100`, `name!=Frodo`, `!email`), values
 * percent-encoded. `URLSearchParams` can't express this (it would encode the
 * operators and append stray `=`), so the string is built by hand.
 *
 * Returns `''` when there is nothing to encode.
 *
 * @example
 * buildQuery({ filter: { academyAwardWins: { $gte: 1 } }, sort: { name: 'asc' }, limit: 10 })
 * // => 'academyAwardWins>=1&sort=name:asc&limit=10'
 */
export function buildQuery<T>(options: ListOptions<T> = {}): string {
  const segments: string[] = [];

  if (options.filter) segments.push(...filterSegments(options.filter));
  if (options.sort) {
    const sort = sortSegment(options.sort);
    if (sort) segments.push(sort);
  }
  if (options.limit !== undefined) segments.push(`limit=${options.limit}`);
  if (options.page !== undefined) segments.push(`page=${options.page}`);
  if (options.offset !== undefined) segments.push(`offset=${options.offset}`);

  return segments.join('&');
}

const COMPARISON_OPERATORS: Record<string, string> = {
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

function filterSegments<T>(filter: Filter<T>): string[] {
  const segments: string[] = [];
  for (const [field, condition] of Object.entries(filter)) {
    if (condition === undefined) continue;
    segments.push(...fieldSegments(field, condition));
  }
  return segments;
}

/** Turn one field's condition into one or more `field<op>value` segments. */
function fieldSegments(field: string, condition: unknown): string[] {
  // Bare RegExp → regex match.
  if (condition instanceof RegExp) {
    return [`${field}=${regexLiteral(condition)}`];
  }
  // Array → `$in`.
  if (Array.isArray(condition)) {
    return [`${field}=${condition.map(encodeValue).join(',')}`];
  }
  // Operator object → one segment per operator.
  if (isOperatorObject(condition)) {
    return Object.entries(condition)
      .filter(([, value]) => value !== undefined)
      .map(([operator, value]) => operatorSegment(field, operator, value));
  }
  // Scalar → equality.
  return [`${field}=${encodeValue(condition)}`];
}

function operatorSegment(field: string, operator: string, value: unknown): string {
  switch (operator) {
    case '$eq':
      return `${field}=${encodeValue(value)}`;
    case '$ne':
      return value instanceof RegExp
        ? `${field}!=${regexLiteral(value)}`
        : `${field}!=${encodeValue(value)}`;
    case '$not':
      if (!(value instanceof RegExp)) {
        throw new Error('Filter operator `$not` only supports a RegExp (negated regex match).');
      }
      return `${field}!=${regexLiteral(value)}`;
    case '$in':
      return `${field}=${asArray(value).map(encodeValue).join(',')}`;
    case '$nin':
      return `${field}!=${asArray(value).map(encodeValue).join(',')}`;
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte':
      return `${field}${COMPARISON_OPERATORS[operator]}${encodeValue(value)}`;
    case '$exists':
      return value ? `${field}` : `!${field}`;
    default:
      throw new Error(`Unsupported filter operator: ${operator}`);
  }
}

function sortSegment<T>(sort: Sort<T>): string | undefined {
  const entries = Object.entries(sort).filter(([, direction]) => direction !== undefined);
  const first = entries[0];
  if (!first) return undefined;
  const [field, direction] = first;
  return `sort=${field}:${direction}`;
}

/** A plain object carrying operators — not a RegExp or array (handled earlier). */
function isOperatorObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/** Percent-encode a single value; operators around it stay literal. */
function encodeValue(value: unknown): string {
  return encodeURIComponent(String(value));
}

/** Render a RegExp as the API expects: `/source/flags` (left raw for the parser). */
function regexLiteral(regex: RegExp): string {
  return `/${regex.source}/${regex.flags}`;
}
