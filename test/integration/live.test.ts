import { describe, expect, it } from 'vitest';
import { Lotr } from '../../src';

/**
 * Live integration tests against the real API. Opt-in: they self-skip unless
 * LOTR_API_KEY is set, and run via `npm run test:integration`. Never part of the
 * default `npm test`, so CI stays hermetic.
 */
const apiKey = process.env.LOTR_API_KEY;

describe.skipIf(!apiKey)('live API', () => {
  const lotr = new Lotr({ apiKey });

  it('lists movies with pagination metadata', async () => {
    const page = await lotr.movies.list({ limit: 3 });
    expect(page.results.length).toBeGreaterThan(0);
    expect(page.results.length).toBeLessThanOrEqual(3);
    expect(page.total).toBeGreaterThan(0);
    expect(page.results[0]).toHaveProperty('id');
    expect(page.results[0]).toHaveProperty('name');
  });

  it('applies a numeric filter server-side', async () => {
    const page = await lotr.movies.list({ filter: { academyAwardWins: { $gte: 1 } } });
    expect(page.results.every((movie) => movie.academyAwardWins >= 1)).toBe(true);
  });

  it('fetches a single movie by id', async () => {
    const first = (await lotr.movies.list({ limit: 1 })).results[0];
    expect(first).toBeDefined();
    const movie = await lotr.movies.get(first!.id);
    expect(movie.id).toBe(first!.id);
  });

  it('fetches quotes nested under a movie', async () => {
    const movies = await lotr.movies.list({ limit: 5 });
    const movie = movies.results[0]!;
    const quotes = await lotr.movies.quotes(movie.id, { limit: 2 });
    expect(Array.isArray(quotes.results)).toBe(true);
  });
});
