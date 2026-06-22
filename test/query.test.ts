import { describe, expect, it } from 'vitest';
import { buildQuery } from '../src/query';
import type { Movie, Quote } from '../src/types/models';

// buildQuery is the heart of the SDK's filtering, so it gets the most coverage:
// every operator maps to an exact query-string segment.
describe('buildQuery', () => {
  it('returns an empty string when there is nothing to encode', () => {
    expect(buildQuery()).toBe('');
    expect(buildQuery({})).toBe('');
  });

  describe('equality and membership shorthands', () => {
    it('scalar value → equality', () => {
      expect(buildQuery<Movie>({ filter: { name: 'The Two Towers' } })).toBe(
        'name=The%20Two%20Towers',
      );
    });

    it('number scalar → equality', () => {
      expect(buildQuery<Movie>({ filter: { academyAwardWins: 4 } })).toBe('academyAwardWins=4');
    });

    it('array → $in (comma-separated, literal commas, encoded values)', () => {
      expect(buildQuery<Quote>({ filter: { character: ['gandalf', 'frodo baggins'] } })).toBe(
        'character=gandalf,frodo%20baggins',
      );
    });
  });

  describe('explicit operators', () => {
    it('$eq', () => {
      expect(buildQuery<Movie>({ filter: { name: { $eq: 'Gandalf' } } })).toBe('name=Gandalf');
    });

    it('$ne', () => {
      expect(buildQuery<Movie>({ filter: { name: { $ne: 'Frodo' } } })).toBe('name!=Frodo');
    });

    it('comparison operators $gt / $gte / $lt / $lte', () => {
      expect(buildQuery<Movie>({ filter: { budgetInMillions: { $gt: 100 } } })).toBe(
        'budgetInMillions>100',
      );
      expect(buildQuery<Movie>({ filter: { runtimeInMinutes: { $gte: 160 } } })).toBe(
        'runtimeInMinutes>=160',
      );
      expect(buildQuery<Movie>({ filter: { academyAwardNominations: { $lt: 5 } } })).toBe(
        'academyAwardNominations<5',
      );
      expect(buildQuery<Movie>({ filter: { rottenTomatoesScore: { $lte: 95 } } })).toBe(
        'rottenTomatoesScore<=95',
      );
    });

    it('$in / $nin', () => {
      expect(buildQuery<Quote>({ filter: { movie: { $in: ['a', 'b'] } } })).toBe('movie=a,b');
      expect(buildQuery<Quote>({ filter: { movie: { $nin: ['a', 'b'] } } })).toBe('movie!=a,b');
    });

    it('$exists true → bare field, false → negated field', () => {
      expect(buildQuery<Movie>({ filter: { name: { $exists: true } } })).toBe('name');
      expect(buildQuery<Movie>({ filter: { name: { $exists: false } } })).toBe('!name');
    });

    it('combines multiple operators on one field into separate segments', () => {
      expect(buildQuery<Movie>({ filter: { budgetInMillions: { $gte: 100, $lt: 200 } } })).toBe(
        'budgetInMillions>=100&budgetInMillions<200',
      );
    });
  });

  describe('regex', () => {
    it('bare RegExp → regex match', () => {
      expect(buildQuery<Movie>({ filter: { name: /towers/i } })).toBe('name=/towers/i');
    });

    it('$not RegExp → negated regex match', () => {
      expect(buildQuery<Movie>({ filter: { name: { $not: /^The/ } } })).toBe('name!=/^The/');
    });

    it('throws if $not is given a non-RegExp', () => {
      // @ts-expect-error — $not only accepts a RegExp
      expect(() => buildQuery<Movie>({ filter: { name: { $not: 'oops' } } })).toThrow(/\$not/);
    });
  });

  describe('sort, pagination, and composition', () => {
    it('serializes a typed sort object to field:direction', () => {
      expect(buildQuery<Movie>({ sort: { boxOfficeRevenueInMillions: 'desc' } })).toBe(
        'sort=boxOfficeRevenueInMillions:desc',
      );
    });

    it('passes through limit / page / offset', () => {
      expect(buildQuery<Movie>({ limit: 10, page: 2, offset: 5 })).toBe('limit=10&page=2&offset=5');
    });

    it('composes filter + sort + pagination', () => {
      expect(
        buildQuery<Movie>({
          filter: { academyAwardWins: { $gte: 1 } },
          sort: { name: 'asc' },
          limit: 10,
        }),
      ).toBe('academyAwardWins>=1&sort=name:asc&limit=10');
    });

    it('ignores undefined conditions', () => {
      expect(buildQuery<Movie>({ filter: { name: undefined } })).toBe('');
    });
  });
});
