/**
 * Runnable end-to-end demo. Exercises the SDK against the real API.
 *
 *   1. Copy `.env.example` to `.env` and add your key (or `export LOTR_API_KEY=...`)
 *   2. npm run demo
 *
 * Get a key at https://the-one-api.dev/sign-up.
 */
import { Lotr, LotrError } from '../src/index.js';

// Load a local .env if one exists (Node 20.12+). Otherwise rely on an exported var.
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file — that's fine if LOTR_API_KEY is already in the environment.
  }
}

async function main(): Promise<void> {
  const lotr = new Lotr(); // reads LOTR_API_KEY from the environment

  console.log('\n— Oscar-winning movies, by box office —');
  const movies = await lotr.movies.list({
    filter: { academyAwardWins: { $gte: 1 } },
    sort: { boxOfficeRevenueInMillions: 'desc' },
    limit: 5,
  });
  for (const movie of movies.results) {
    console.log(
      `  ${movie.name} — ${movie.academyAwardWins} Oscars, $${movie.boxOfficeRevenueInMillions}M`,
    );
  }
  console.log(`  (showing ${movies.results.length} of ${movies.total})`);

  const first = movies.results[0];
  if (first) {
    console.log(`\n— Fetch "${first.name}" by id —`);
    const movie = await lotr.movies.get(first.id);
    console.log(`  ${movie.runtimeInMinutes} min · Rotten Tomatoes ${movie.rottenTomatoesScore}`);

    console.log(`\n— Quotes from "${first.name}" —`);
    const quotes = await lotr.movies.quotes(first.id, { limit: 3 });
    for (const quote of quotes.results) {
      console.log(`  "${quote.dialog}"`);
    }
  }

  console.log('\n— Regex filter: movies whose name matches /the/i —');
  const matches = await lotr.movies.list({ filter: { name: /the/i } });
  console.log(`  matched ${matches.total} movies`);

  console.log('\n— Auto-pagination via listAll() —');
  const names: string[] = [];
  for await (const movie of lotr.movies.listAll({ limit: 2 })) {
    names.push(movie.name);
    if (names.length >= 6) break; // enough to show paging; easy on the rate limit
  }
  console.log(`  first ${names.length} across pages: ${names.join(', ')}`);

  console.log('\nDone.\n');
}

main().catch((error: unknown) => {
  if (error instanceof LotrError) {
    console.error(`\nSDK error (${error.code ?? error.statusCode ?? 'unknown'}): ${error.message}`);
  } else {
    console.error('\nUnexpected error:', error);
  }
  process.exitCode = 1;
});
