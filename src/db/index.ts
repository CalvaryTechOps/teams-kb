import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { fetchWithRetry } from "./neon-fetch";
import * as schema from "./schema";

// The app's default handle uses Neon's HTTP driver: every query is one HTTPS
// request, so there is no connection to keep alive, nothing to go stale while
// Vercel freezes an idle function, and no WebSocket handshake to time out
// under a burst of parallel renders. Neon recommends it for single queries
// and it is safe to create once at module scope, which is how `db` is used.
//
// The HTTP driver cannot run interactive transactions. Anything that needs
// `BEGIN … COMMIT` with dependent statements goes through `withTransaction`
// in ./transaction.ts, which opens a WebSocket client for that call only.
//
// The driver's HTTPS request itself can still fail — undici's `fetch failed`
// on a stale keep-alive socket or a connect that never opens — and in
// production that came in short per-instance bursts that took every page
// down with it (plans/neon-fetch-retry.md, after db-pool-no-connection-reuse
// and neon-http-driver). `fetchWithRetry` retries those: any statement when
// the connection never opened, read-only statements also when the socket
// died mid-flight, never a write that Neon may have received.
neonConfig.fetchFunction = fetchWithRetry;

export const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
