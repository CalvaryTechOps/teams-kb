import { Client, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// Neon's serverless driver needs a WebSocket implementation in Node.
neonConfig.webSocketConstructor = ws;

type Schema = typeof schema;

/** The handle passed to a `withTransaction` callback. */
export type Transaction = Parameters<
  Parameters<NeonDatabase<Schema>["transaction"]>[0]
>[0];

// A hung WebSocket handshake fails fast with a clear error instead of
// consuming the route's whole maxDuration. Neon compute can take a few
// seconds to wake from suspend, so keep this comfortably above ~5 s.
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Run `fn` inside one interactive Postgres transaction.
 *
 * The default `db` handle (src/db/index.ts) speaks Neon's HTTP protocol,
 * which has no transactions. This opens a WebSocket `Client` for the
 * duration of a single call — Neon's rule for that driver is "connect, use
 * and close within one request handler" — runs the callback inside
 * drizzle's `transaction()`, and always closes the client afterwards.
 */
export async function withTransaction<T>(
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  await client.connect();
  try {
    return await drizzle(client, { schema }).transaction(fn);
  } finally {
    await client.end();
  }
}
