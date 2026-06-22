/**
 * Domain models for the resources this SDK covers.
 *
 * Fields mirror the-one-api responses, with one normalization: we change _id to id.  (some resources return both, but in those cases they are the same)
 * These are manually verified against via real API calls
 */

export interface Movie {
  id: string;
  name: string;
  runtimeInMinutes: number;
  budgetInMillions: number;
  boxOfficeRevenueInMillions: number;
  academyAwardNominations: number;
  academyAwardWins: number;
  rottenTomatoesScore: number;
}

export interface Quote {

  id: string;
  dialog: string;
  /** Id of the movie this quote is from. */
  movie: string;
  /** Id of the character who spoke the quote. */
  character: string;
}
