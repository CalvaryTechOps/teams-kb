import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// Neon's serverless driver needs a WebSocket implementation in Node.
neonConfig.webSocketConstructor = ws;

// Neon's rule for this driver: a Pool/Client "must be connected, used and
// closed within a single request handler". The pool itself lives at module
// scope because `db` is imported everywhere, so instead we make sure no
// connection outlives the invocation that opened it. Vercel freezes an idle
// function between invocations; a WebSocket left open in the pool is closed
// by the far side while frozen, and the pool would hand that dead client to
// the next query ("Connection terminated unexpectedly", close code 1006).
//
// - maxUses: 1 destroys a client as soon as it is released, so the pool never
//   holds an idle connection. A db.transaction() is one checkout, so all of
//   its queries still share a single connection.
// - connectionTimeoutMillis fails a hung WebSocket handshake fast instead of
//   consuming the route's whole maxDuration. Neon compute can take a few
//   seconds to wake from suspend, so keep this comfortably above ~5 s.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  maxUses: 1,
  connectionTimeoutMillis: 10_000,
});

// With maxUses: 1 there are no idle clients to error, but if one ever does,
// log it rather than let it surface as an unhandled error event.
pool.on("error", (err: Error) => {
  console.error("db pool: idle client error", err);
});

export const db = drizzle(pool, { schema });
