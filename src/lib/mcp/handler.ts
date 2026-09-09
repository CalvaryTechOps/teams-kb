import type {
  CreateMcpHandlerOptions,
  ServerCapabilities,
} from "@modelcontextprotocol/server";
import { MCP_MAX_MARKDOWN_BYTES } from "./config";

// Handler wiring shared by the MCP route and its tests
// (plans/mcp-listen-stream-timeouts.md). Deliberately free of "server-only"
// and of database imports so vitest can build the very same handler.

/**
 * What the server advertises. Tools are registered afresh for every request
 * and never change while a client is connected, so `listChanged` is false.
 * Without an explicit value, McpServer.registerTool advertises `true`, and a
 * 2026-07-28 client that reads that bit opens a `subscriptions/listen` stream
 * to hear about changes this server will never send.
 */
export const MCP_SERVER_CAPABILITIES: ServerCapabilities = {
  tools: { listChanged: false },
};

/**
 * `subscriptions/listen` is answered with a server-sent-events stream that
 * stays open (keepalives every 15 s) until the client hangs up. On a Vercel
 * function with `maxDuration = 30` that stream can never end gracefully: the
 * platform kills it at 30 s, the client reconnects, and the loop repeats
 * until the client gives up — each attempt a full 30 s of function time
 * logged as "Task timed out". With `maxSubscriptions: 0` the SDK refuses the
 * request up front with an in-band JSON-RPC error (-32603, "Subscription
 * limit reached"), so the client carries on without notifications, which is
 * all this stateless server could offer anyway.
 */
export const MCP_HANDLER_OPTIONS = {
  // Accept 2025-era clients for now; tighten to "reject" once every client
  // in use speaks 2026-07-28 (plans/completed/mcp-server.md, question 1).
  legacy: "stateless",
  maxSubscriptions: 0,
} satisfies CreateMcpHandlerOptions;

/**
 * Longest request body (in characters) the per-request method logger will
 * parse. create_draft carries up to MCP_MAX_MARKDOWN_BYTES of Markdown,
 * JSON-escaped, so allow twice that; anything bigger is logged as oversized
 * and left to the SDK.
 */
export const MCP_LOG_BODY_LIMIT = 2 * MCP_MAX_MARKDOWN_BYTES;

/**
 * The JSON-RPC method name(s) in a request body, for the one-line
 * `mcp request` log that names what each call was. Never returns params.
 * Bodies that cannot be read as a message or batch get a parenthesised
 * placeholder instead of throwing, so logging can never fail a request.
 */
export function jsonRpcMethods(body: string, limit = MCP_LOG_BODY_LIMIT): string[] {
  if (body.length > limit) return ["(oversized)"];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return ["(malformed)"];
  }
  if (Array.isArray(parsed)) {
    return parsed.length === 0 ? ["(empty batch)"] : parsed.map(methodOf);
  }
  return [methodOf(parsed)];
}

function methodOf(message: unknown): string {
  if (
    message !== null &&
    typeof message === "object" &&
    "method" in message &&
    typeof message.method === "string"
  ) {
    return message.method;
  }
  return "(no method)";
}
