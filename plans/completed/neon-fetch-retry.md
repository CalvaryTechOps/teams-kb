# Plan: Retry transient connection failures in the Neon HTTP driver

**Status: complete — implemented on `feat/neon-fetch-retry` (2026-09-24),
tested by Chris locally and on staging; awaiting the PR to `main`.**
Verified locally: lint, `tsc --noEmit`,
250 tests (18 new in `src/db/neon-fetch.test.ts`) and `next build` pass;
a script against the Neon `development` branch confirmed the driver calls
the wrapper — a `select` retried past a simulated `UND_ERR_SOCKET` failure
and succeeded on the second attempt with the `db fetch retry` warning,
and an `insert` was rejected without a retry.

## Context

On 2026-09-23 (20:28 and 21:47–21:50 UTC) and again on 2026-09-24
(21:17–21:21 UTC) production requests failed with:

```
Error: Failed query: select … from "oauth_resource" where "identifier" = $1
  digest: '3581904886'
  [cause]: NeonDbError: Error connecting to database: TypeError: fetch failed
```

The Vercel logs for both days (`vercel logs --environment production
--level error`) show the same shape each time:

- The failing query is always better-auth's OAuth resource seed. That
  plugin tries to seed its `oauth_resource` row when the auth module
  initialises in a function instance; if that first query fails it defers
  and retries on every request until it succeeds, so it is always the
  first query to run in a fresh instance and always the one that trips.
  Any other query would fail the same way — the error is the driver's
  HTTPS `fetch` to Neon's proxy failing, not a Postgres error.
- The failure is per function instance. On 2026-09-24 a database-backed
  endpoint (`/api/auth/jwks`) answered from another instance nineteen
  seconds after the home page failed; on 2026-09-23 the group sync kept
  writing to Neon while page renders on another instance failed.
- Once an instance is in this state every request it serves fails for a
  few minutes, then it clears on its own (each bad stretch lasted 2–4
  minutes, ten to a dozen failed requests).
- Both days the bad stretch followed a burst of a dozen or more parallel
  page renders (Next.js link prefetching), which opens many keep-alive
  connections from one instance to Neon's HTTP endpoint.
- Neon's status page showed no incident either day; the Neon compute was
  awake throughout the 2026-09-23 and 2026-09-24 windows (the operations
  log shows only the expected suspend/resume cycles).

Vercel's log formatter collapses the inner cause to `[cause]: [Error]`
(util.inspect depth), so the exact undici error code is unknown. The best
match is the stale keep-alive socket problem (Neon's proxy closes an idle
socket, undici hands it to the next request, the write fails): the driver's
own repo has that exact signature, `fetch failed [cause]: SocketError:
other side closed`, in neondatabase/serverless#146, closed without a
driver-side fix.

Whatever the link-level cause, the app currently has zero tolerance for a
single failed connection attempt. This is the third plan on the same
theme: `db-pool-no-connection-reuse` (stale WebSocket clients across
frozen invocations) and `neon-http-driver` (moved the default handle to
HTTP so nothing is kept alive between invocations). The HTTP driver has no
Postgres connection to go stale, but undici keeps HTTPS sockets to Neon's
proxy alive underneath it, and that is what fails now.

What exists and matters here:

- `src/db/index.ts` builds `db = drizzle(neon(process.env.DATABASE_URL))`
  from `drizzle-orm/neon-http`. `neon()` sends every query as one
  `fetch(url, { method: "POST", body: JSON.stringify({ query, params }),
  headers })` (or `{ queries: [...] }` for `db.batch`). The only code in
  the driver's `try` is the `fetch` call itself: a rejection there becomes
  `NeonDbError("Error connecting to database: …")` with the original error
  on `sourceError`. Response parsing is outside that try and unaffected.
- `neonConfig.fetchFunction` (static, global) lets the app supply the
  function the driver calls instead of global `fetch`, with the same
  signature (`node_modules/@neondatabase/serverless/index.d.mts`).
- `db-pool-no-connection-reuse` rejected "retry once" because it masked a
  real bug (zombie pooled clients) and a retry inside a WebSocket
  transaction is unsafe. Neither applies here: with HTTP each statement is
  its own request, there is nothing to leak, and the retry never runs
  inside `withTransaction` (that helper uses the WebSocket `Client`, not
  `fetchFunction`).
- Node 24 on Vercel; undici errors surface as `TypeError: fetch failed`
  with the real error on `cause` (`code` such as `UND_ERR_CONNECT_TIMEOUT`,
  `UND_ERR_SOCKET`, `ECONNRESET`, `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`,
  or an `AggregateError` from happy-eyeballs connects).

## Design

A small module, `src/db/neon-fetch.ts`, exporting `fetchWithRetry` (the
function handed to `neonConfig.fetchFunction`) and the pure helpers it is
built from, so the policy is unit-testable without a network:

1. **Classify the failure.** Only a rejected `fetch` is considered; an HTTP
   response of any status is returned untouched (the driver turns those
   into proper `NeonDbError`s with Postgres codes). The rejection's
   `cause` (recursively, to cover `AggregateError.errors`) is sorted into:
   - *connect-phase* — the request never left: `UND_ERR_CONNECT_TIMEOUT`,
     `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `ENETUNREACH`,
     `EHOSTUNREACH`, or an `AggregateError` made only of those. Safe to
     retry for any statement.
   - *socket-phase* — `UND_ERR_SOCKET` ("other side closed"),
     `ECONNRESET`, `EPIPE`, `ETIMEDOUT`. The request may or may not have
     reached Neon.
   - anything else (abort, TLS certificate, unknown) — not retried.
2. **Decide by statement kind.** The request body is the driver's JSON, so
   the wrapper can see the SQL without any driver change. A body is
   *read-only* when every statement in it (one `query`, or each of
   `queries`) starts with `SELECT`, or starts with `WITH` and contains no
   `INSERT`/`UPDATE`/`DELETE`/`MERGE` token. Read-only bodies retry on
   connect- and socket-phase failures; other bodies retry on connect-phase
   failures only. So no `INSERT`/`UPDATE`/`DELETE` can ever run twice.
   (Answered: reads only on socket-phase failures.)
3. **Budget.** Two retries after the first attempt, waiting 150 ms then
   500 ms — three attempts, under a second added at worst. (Answered.)
4. **Log what we could not see.** Every retried failure is logged once
   with `console.warn("db fetch retry", { attempt, phase, code, message,
   readOnly })` — the undici code and message, never the SQL or params —
   so the next incident tells us the real cause. The final failure is
   rethrown unchanged (the driver wraps it as today), so nothing else in
   the app changes.
5. **Wire it up** in `src/db/index.ts`: `neonConfig.fetchFunction =
   fetchWithRetry` before `neon()` is called, with a comment pointing at
   this plan and at the two earlier ones. `withTransaction` is untouched.

Rejected alternatives:

- **Disable keep-alive for Neon requests** (`Connection: close`, or a
  dedicated undici `Agent`). Would remove the suspected cause outright but
  costs a TLS handshake per query for every request, and passing a custom
  `dispatcher` needs the `undici` npm package to match the version Node
  bundles (the Vercel CLI hit exactly that mismatch on newer Node). Keep
  in reserve if the logging from step 4 confirms stale sockets and the
  retry is not enough.
- **Retry inside better-auth's seed.** It is their code, and it is only
  the messenger.
- **Error boundary with a reload.** Worth doing but a separate, UI-level
  change; not part of this plan.

## Steps

1. Branch `feat/neon-fetch-retry` off `main`.
2. Add `src/db/neon-fetch.ts`: `classifyFetchFailure(err)`,
   `isReadOnlyBody(body)`, `fetchWithRetry(input, init)` with the delays
   injectable for tests.
3. Add `src/db/neon-fetch.test.ts`: classification of each error family
   (including `AggregateError` and nested causes); read-only detection for
   `SELECT`, `WITH … SELECT`, `WITH … INSERT`, `INSERT`, batches, and
   non-JSON bodies (treated as writes); the retry loop — read-only body
   retries on a socket-phase error and succeeds on the third attempt;
   write body does not retry on a socket-phase error but does on a
   connect-phase one; unknown errors are not retried; HTTP responses are
   returned as-is; the budget is respected and the last error rethrown.
4. `src/db/index.ts`: set `neonConfig.fetchFunction` and add the comment.
5. `README.md`: one sentence under the database bullet noting the retry
   and where its policy lives.
6. Local verification: `npm run lint`, `npx tsc --noEmit`, `npm test`,
   `npm run build`; then `npm run dev` against the Neon `development`
   branch and load a page to confirm queries still go through the wrapper
   (a temporary log line, removed before commit, or a breakpoint).
7. Commit on the feature branch. No push.

How we will know it worked, once it is in production: `vercel logs
--environment production --since 3d` should show `db fetch retry` warnings
(with a real undici code) where it would previously have shown
`Error connecting to database: TypeError: fetch failed`, and no request
failing with digest `3581904886` unless all three attempts failed.

## Open questions

1. Retry writes on socket-phase failures (reset / other side closed)?
   Answer (2026-09-24): no — reads only; writes retry on connect-phase
   failures only.
2. Retry budget? Answer (2026-09-24): 2 retries, 150 ms then 500 ms.
