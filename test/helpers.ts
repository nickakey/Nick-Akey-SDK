import { vi } from 'vitest';

/** Build a `Response` with a JSON (or empty) body for use in a stub fetch. */
export function response(status: number, body?: unknown, headers?: HeadersInit): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

/** A standard list envelope, with overridable pagination metadata. */
export function envelope(
  docs: Array<Record<string, unknown>>,
  meta: Partial<{ total: number; limit: number; offset: number; page: number; pages: number }> = {},
) {
  return { docs, total: docs.length, limit: 1000, offset: 0, page: 1, pages: 1, ...meta };
}

/**
 * A stub `fetch` that returns/throws queued items in order. Throwing an `Error`
 * simulates a network failure; returning a `Response` simulates an HTTP reply.
 */
export function queuedFetch(items: Array<Response | Error>) {
  const queue = [...items];
  return vi.fn(async (): Promise<Response> => {
    const next = queue.shift();
    if (next === undefined) throw new Error('queuedFetch: no more responses queued');
    if (next instanceof Error) throw next;
    return next;
  });
}
