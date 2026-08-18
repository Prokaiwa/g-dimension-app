// The one UUID pattern in the app.
//
// Every id in this schema is a Postgres `uuid`, and `.eq()` on a uuid column
// with a string that is not one is a **22P02** error, not an empty result.
// PostgREST returns that as a 400, so an address like `/maintenance/detailing`
// fires real failing requests at Supabase (and at Sentry) before anyone can
// discover that the URL was simply wrong.
//
// That matters more than it looks, because React Router cannot express "this
// segment must be a uuid". A route like `/maintenance/:sessionId` is a
// catch-all for ONE segment, so it happily matches any word and hands it
// straight to a query. The route DID match, which is why `path="*"` and
// NotFoundPage never get a look in. See components/RequireUuid.tsx.
//
// Single source of truth, per the constitution: this pattern is defined here
// and nowhere else, and scripts/constitution.mjs enforces that.

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when `v` is a syntactically valid UUID. Null/undefined are false. */
export function isUuid(v: string | null | undefined): boolean {
  return typeof v === 'string' && UUID_RE.test(v)
}
