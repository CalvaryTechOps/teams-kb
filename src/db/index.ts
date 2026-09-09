import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
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
export const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
