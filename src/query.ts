import type { Filter, ListOptions, Sort } from './types/query.js';

/**
 * SUPPORTED TYPES FROM API DOCS
 *
 * PAGINATION
 * limit /character?limit=100
 * page /character?page=2 (limit default is 10)
 * offset /character?offset=3 (limit default is 10)
 *
 * SORTING
 * /character?sort=name:asc
 * /quote?sort=character:desc
 *
 * FILTERING
 * match /character?name=Gandalf
 * negate match /character?name!=Frodo
 *
 * include /character?race=Hobbit,Human
 * exclude /character?race!=Orc,Goblin
 *
 * exists /character?name
 * doesn't exist /character?!name
 *
 * regex /character?name=/foot/i OR /character?name!=/foot/i
 *
 * less than /movie?budgetInMillions<100
 * greater than /movie?academyAwardWins>0
 * greater than or equal to /movie?runtimeInMinutes>=160
 *
 */

/**
 * Serialize list options into the-one-api's query-string dialect.
 *
 * The API is a bit unique, in that it doesn't expect traditional query param format.
 *
 * E.G. "?runtimeInMinutes<500" is valid, but does not follow the standard query param format of needing a question mark and an equals sign.
 *
 * For that reason, we can't use an off the shelf URL encoder and need to roll our own.
 *
 * The rules are:
 *    keep operators as is (>, =, <, etc)
 *    URL encode the actual values around the operators (e.g. turn spaces into %20 etc)
 */
export function buildQuery<T>(options: ListOptions<T> = {}): string {
  const segments: string[] = [];

  // simple cases with minimal transformation
  if (options.limit !== undefined) segments.push(`limit=${options.limit}`);
  if (options.page !== undefined) segments.push(`page=${options.page}`);
  if (options.offset !== undefined) segments.push(`offset=${options.offset}`);

  // complex cases that require more transformation
  if (options.filter) segments.push(...buildFilterSegments(options.filter));
  if (options.sort) segments.push(buildSortSegment(options.sort));

  return segments.join('&');
}

const COMPARISON_OPERATORS: Record<string, string> = {
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

function buildFilterSegments<T>(filter: Filter<T>): string[] {
  const segments: string[] = [];
  for (const [field, condition] of Object.entries(filter)) {
    if (condition === undefined) continue;
    segments.push(...buildFieldSegments(field, condition));
  }
  return segments;
}

/** Turn one field's condition into one or more `field<op>value` segments. */
function buildFieldSegments(field: string, condition: unknown): string[] {
  // Bare RegExp → regex match.
  if (condition instanceof RegExp) {
    return [`${field}=${formatRegex(condition)}`];
  }

  // Array → `$in`.
  if (Array.isArray(condition)) {
    return [`${field}=${condition.map(encodeValue).join(',')}`];
  }

  // Operator object → one segment per operator.
  if (isOperatorObject(condition)) {
    return Object.entries(condition)
      .filter(([, value]) => value !== undefined)
      .map(([operator, value]) => buildOperatorSegment(field, operator, value));
  }
  // Scalar → equality.
  return [`${field}=${encodeValue(condition)}`];
}

function buildOperatorSegment(field: string, operator: string, value: unknown): string {
  switch (operator) {
    case '$eq':
      return `${field}=${encodeValue(value)}`;
    case '$ne':
      return value instanceof RegExp
        ? `${field}!=${formatRegex(value)}`
        : `${field}!=${encodeValue(value)}`;
    case '$not':
      if (!(value instanceof RegExp)) {
        throw new Error('Filter operator `$not` only supports a RegExp (negated regex match).');
      }
      return `${field}!=${formatRegex(value)}`;
    case '$in':
      return `${field}=${ensureArray(value).map(encodeValue).join(',')}`;
    case '$nin':
      return `${field}!=${ensureArray(value).map(encodeValue).join(',')}`;
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

function buildSortSegment<T>(sort: Sort<T>): string {
  return `sort=${String(sort.field)}:${sort.direction ?? 'asc'}`;
}

/** A plain object carrying operators — not a RegExp or array (handled earlier). */
function isOperatorObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function ensureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/** Percent-encode a single value; operators around it stay literal. */
function encodeValue(value: unknown): string {
  return encodeURIComponent(String(value));
}

/** Render a RegExp as the API expects: `/source/flags` (left raw for the parser). */
function formatRegex(regex: RegExp): string {
  return `/${regex.source}/${regex.flags}`;
}
