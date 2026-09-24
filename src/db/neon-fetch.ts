/**
 * Retry policy for the Neon HTTP driver's `fetch` (plans/neon-fetch-retry.md).
 *
 * `neon()` sends every statement as one HTTPS POST to Neon's proxy. When
 * that `fetch` rejects — undici's `TypeError: fetch failed` with the real
 * error on `cause` — the driver wraps it as "Error connecting to database"
 * and the whole render fails. In production those rejections come in
 * short per-instance bursts (stale keep-alive sockets or a connect that
 * never opens), so one or two retries are enough to ride them out.
 *
 * Safety rule: a statement that writes is retried only when the request
 * provably never left (connect-phase failure). Read-only statements are
 * also retried when the socket died mid-flight, because re-running a
 * SELECT is harmless. Nothing else is retried; HTTP responses of any
 * status are returned untouched so the driver keeps reporting Postgres
 * errors exactly as before.
 */

export type FailurePhase = "connect" | "socket" | "other";

/** Errno / undici codes for a connection that was never established. */
const CONNECT_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

/** Codes for a connection that died after it was established. */
const SOCKET_CODES = new Set([
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
]);

type ErrorLike = {
  code?: unknown;
  cause?: unknown;
  errors?: unknown;
  message?: unknown;
};

function asErrorLike(err: unknown): ErrorLike | null {
  return typeof err === "object" && err !== null ? (err as ErrorLike) : null;
}

/**
 * Walk `cause` chains and `AggregateError.errors` collecting the leaf error
 * codes. An error with no code and no children contributes nothing.
 */
function collectCodes(err: unknown, out: string[], depth = 0): void {
  const e = asErrorLike(err);
  if (!e || depth > 8) return;
  if (typeof e.code === "string") out.push(e.code);
  if (Array.isArray(e.errors)) {
    for (const child of e.errors) collectCodes(child, out, depth + 1);
  }
  if (e.cause !== undefined) collectCodes(e.cause, out, depth + 1);
}

/**
 * Sort a rejected `fetch` into the phase it failed in. A failure counts as
 * connect-phase only when every code found is a connect-phase code, so an
 * `AggregateError` mixing a refused IPv6 connect with a reset IPv4 one is
 * treated as the more dangerous socket-phase.
 */
export function classifyFetchFailure(err: unknown): {
  phase: FailurePhase;
  codes: string[];
} {
  const codes: string[] = [];
  collectCodes(err, codes);
  if (codes.length === 0) return { phase: "other", codes };
  if (codes.every((c) => CONNECT_CODES.has(c))) return { phase: "connect", codes };
  if (codes.every((c) => CONNECT_CODES.has(c) || SOCKET_CODES.has(c))) {
    return { phase: "socket", codes };
  }
  return { phase: "other", codes };
}

const WRITE_TOKEN = /\b(insert|update|delete|merge|truncate|alter|drop|create)\b/i;

/** Strip leading whitespace and SQL comments so the first keyword is visible. */
function leadingKeyword(sql: string): string {
  let s = sql;
  for (;;) {
    const trimmed = s.replace(/^\s+/, "");
    if (trimmed.startsWith("--")) {
      const nl = trimmed.indexOf("\n");
      s = nl === -1 ? "" : trimmed.slice(nl + 1);
    } else if (trimmed.startsWith("/*")) {
      const end = trimmed.indexOf("*/");
      s = end === -1 ? "" : trimmed.slice(end + 2);
    } else {
      s = trimmed;
      break;
    }
  }
  return (s.match(/^[a-z]+/i)?.[0] ?? "").toLowerCase();
}

/** True when a single SQL statement cannot modify data. */
export function isReadOnlySql(sql: string): boolean {
  const kw = leadingKeyword(sql);
  if (kw === "select") return true;
  if (kw === "with") return !WRITE_TOKEN.test(sql);
  return false;
}

/**
 * True when every statement in the driver's request body is read-only.
 * The body is `{ query, params }` for one statement or `{ queries: [...] }`
 * for a batch. Anything unparseable is treated as a write.
 */
export function isReadOnlyBody(body: unknown): boolean {
  if (typeof body !== "string") return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null) return false;
  const p = parsed as { query?: unknown; queries?: unknown };
  if (typeof p.query === "string") return isReadOnlySql(p.query);
  if (Array.isArray(p.queries) && p.queries.length > 0) {
    return p.queries.every(
      (q) =>
        typeof q === "object" &&
        q !== null &&
        typeof (q as { query?: unknown }).query === "string" &&
        isReadOnlySql((q as { query: string }).query),
    );
  }
  return false;
}

/** Retry delays in milliseconds; the array length is the retry count. */
export const RETRY_DELAYS_MS: readonly number[] = [150, 500];

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type RetryOptions = {
  fetch?: FetchLike;
  delays?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  warn?: (message: string, detail: Record<string, unknown>) => void;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Build the function handed to `neonConfig.fetchFunction`. Options exist
 * for tests; production uses the defaults.
 */
export function createFetchWithRetry(options: RetryOptions = {}): FetchLike {
  const {
    fetch: doFetch = (input, init) => globalThis.fetch(input, init),
    delays = RETRY_DELAYS_MS,
    sleep = defaultSleep,
    warn = (message, detail) => console.warn(message, detail),
  } = options;

  return async function fetchWithRetry(input, init) {
    const readOnly = isReadOnlyBody(init?.body);
    for (let attempt = 0; ; attempt++) {
      try {
        return await doFetch(input, init);
      } catch (err) {
        const { phase, codes } = classifyFetchFailure(err);
        const retryable =
          phase === "connect" || (phase === "socket" && readOnly);
        if (!retryable || attempt >= delays.length) throw err;
        const cause = asErrorLike(asErrorLike(err)?.cause);
        warn("db fetch retry", {
          attempt: attempt + 1,
          phase,
          codes,
          readOnly,
          message:
            typeof cause?.message === "string"
              ? cause.message
              : err instanceof Error
                ? err.message
                : String(err),
        });
        await sleep(delays[attempt]);
      }
    }
  };
}

/** The production wrapper: global fetch, default budget, console logging. */
export const fetchWithRetry: FetchLike = createFetchWithRetry();
