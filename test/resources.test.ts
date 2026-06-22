import { afterEach, describe, expect, it } from 'vitest';
import { Lotr } from '../src';
import { LotrNotFoundError } from '../src/errors';
import { envelope, queuedFetch, response } from './helpers';

function makeLotr(fetchStub: ReturnType<typeof queuedFetch>) {
  return new Lotr({ apiKey: 'k', baseUrl: 'https://api.test/v2', fetch: fetchStub });
}

const prevKey = process.env.LOTR_API_KEY;
afterEach(() => {
  if (prevKey === undefined) delete process.env.LOTR_API_KEY;
  else process.env.LOTR_API_KEY = prevKey;
});

describe('Lotr client construction', () => {
  it('throws a clear error when no API key is available', () => {
    delete process.env.LOTR_API_KEY;
    expect(() => new Lotr({ fetch: queuedFetch([]) })).toThrow(/api key/i);
  });

  it('falls back to the LOTR_API_KEY environment variable', async () => {
    process.env.LOTR_API_KEY = 'env-key';
    const fetchStub = queuedFetch([response(200, envelope([]))]);
    const lotr = new Lotr({ baseUrl: 'https://api.test/v2', fetch: fetchStub });
    await lotr.movies.list();
    const init = fetchStub.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer env-key');
  });
});

describe('movies.list', () => {
  it('builds the URL, unwraps the envelope, and normalizes _id → id', async () => {
    const fetchStub = queuedFetch([
      response(
        200,
        envelope([{ _id: 'm1', name: 'The Two Towers', academyAwardWins: 2 }], { total: 1 }),
      ),
    ]);
    const page = await makeLotr(fetchStub).movies.list({
      filter: { academyAwardWins: { $gte: 1 } },
      limit: 1,
    });

    expect(page.results).toEqual([{ id: 'm1', name: 'The Two Towers', academyAwardWins: 2 }]);
    expect(page.total).toBe(1);
    expect(fetchStub.mock.calls[0][0]).toBe(
      'https://api.test/v2/movie?academyAwardWins>=1&limit=1',
    );
  });
});

describe('movies.get', () => {
  it('returns a single normalized document', async () => {
    const fetchStub = queuedFetch([response(200, envelope([{ _id: 'm1', name: 'X' }]))]);
    const movie = await makeLotr(fetchStub).movies.get('m1');

    expect(movie).toEqual({ id: 'm1', name: 'X' });
    expect(fetchStub.mock.calls[0][0]).toBe('https://api.test/v2/movie/m1');
  });

  it('url-encodes the id', async () => {
    const fetchStub = queuedFetch([response(200, envelope([{ _id: 'a b' }]))]);
    await makeLotr(fetchStub).movies.get('a b');
    expect(fetchStub.mock.calls[0][0]).toBe('https://api.test/v2/movie/a%20b');
  });

  it('throws LotrNotFoundError when no document matches', async () => {
    const fetchStub = queuedFetch([response(200, envelope([], { total: 0 }))]);
    await expect(makeLotr(fetchStub).movies.get('nope')).rejects.toBeInstanceOf(LotrNotFoundError);
  });
});

describe('movies.quotes (nested route)', () => {
  it('hits /movie/{id}/quote and returns typed quotes', async () => {
    const fetchStub = queuedFetch([
      response(
        200,
        envelope([{ _id: 'q1', dialog: 'Fly, you fools!', movie: 'm1', character: 'c1' }]),
      ),
    ]);
    const page = await makeLotr(fetchStub).movies.quotes('m1', { limit: 5 });

    expect(page.results[0]).toMatchObject({ id: 'q1', dialog: 'Fly, you fools!' });
    expect(fetchStub.mock.calls[0][0]).toBe('https://api.test/v2/movie/m1/quote?limit=5');
  });
});

describe('quotes.list', () => {
  it('hits /quote', async () => {
    const fetchStub = queuedFetch([response(200, envelope([{ _id: 'q1', dialog: 'hi' }]))]);
    await makeLotr(fetchStub).quotes.list();
    expect(fetchStub.mock.calls[0][0]).toBe('https://api.test/v2/quote');
  });
});

describe('listAll (auto-pagination)', () => {
  it('lazily walks every page and yields each item', async () => {
    const fetchStub = queuedFetch([
      response(200, envelope([{ _id: 'A' }, { _id: 'B' }], { page: 1, pages: 2 })),
      response(200, envelope([{ _id: 'C' }], { page: 2, pages: 2 })),
    ]);
    const lotr = makeLotr(fetchStub);

    const ids: string[] = [];
    for await (const movie of lotr.movies.listAll({ limit: 2 })) {
      ids.push(movie.id);
    }

    expect(ids).toEqual(['A', 'B', 'C']);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(fetchStub.mock.calls[1][0]).toContain('page=2');
  });

  it('stops after a single page when there is only one', async () => {
    const fetchStub = queuedFetch([response(200, envelope([{ _id: 'A' }], { page: 1, pages: 1 }))]);
    const lotr = makeLotr(fetchStub);

    const ids: string[] = [];
    for await (const movie of lotr.movies.listAll()) ids.push(movie.id);

    expect(ids).toEqual(['A']);
    expect(fetchStub).toHaveBeenCalledOnce();
  });
});
