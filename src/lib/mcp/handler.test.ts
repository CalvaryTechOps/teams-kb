import { afterEach, describe, expect, it } from "vitest";
import {
  CLIENT_CAPABILITIES_META_KEY,
  McpServer,
  PROTOCOL_VERSION_META_KEY,
  createMcpHandler,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  MCP_HANDLER_OPTIONS,
  MCP_LOG_BODY_LIMIT,
  MCP_SERVER_CAPABILITIES,
  jsonRpcMethods,
} from "./handler";

const MODERN = "2026-07-28";

// A stand-in for buildKbServer: same constructor options, one trivial tool.
// buildKbServer itself is "server-only" and reaches the database.
function buildServer(): McpServer {
  const server = new McpServer(
    { name: "test", version: "0.0.0" },
    { capabilities: MCP_SERVER_CAPABILITIES },
  );
  server.registerTool(
    "ping",
    { description: "Ping", inputSchema: z.object({}) },
    async () => ({ content: [{ type: "text", text: "pong" }] }),
  );
  return server;
}

const handlers: McpHttpHandler[] = [];
function handler(options: Parameters<typeof createMcpHandler>[1]): McpHttpHandler {
  const h = createMcpHandler(() => buildServer(), { ...options, onerror: () => {} });
  handlers.push(h);
  return h;
}
afterEach(async () => {
  await Promise.all(handlers.splice(0).map((h) => h.close()));
});

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** A 2026-07-28 request: per-request `_meta` envelope plus the required headers. */
function modern(method: string, params: Record<string, unknown> = {}): Request {
  return post(
    {
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          [PROTOCOL_VERSION_META_KEY]: MODERN,
          [CLIENT_CAPABILITIES_META_KEY]: {},
        },
      },
    },
    { "mcp-protocol-version": MODERN, "mcp-method": method },
  );
}

type JsonRpcReply = {
  id?: unknown;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

/** The JSON-RPC response with an id, whether the body is JSON or an SSE stream. */
async function reply(res: Response): Promise<JsonRpcReply> {
  const text = await res.text();
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const messages = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5)) as JsonRpcReply);
    const withId = messages.filter((m) => m.id !== undefined);
    return withId[withId.length - 1];
  }
  return JSON.parse(text) as JsonRpcReply;
}

describe("MCP handler options", () => {
  it("refuses subscriptions/listen at once instead of holding a stream open", async () => {
    const res = await handler(MCP_HANDLER_OPTIONS).fetch(
      modern("subscriptions/listen", { notifications: { toolsListChanged: true } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-type")).not.toContain("text/event-stream");
    const body = await reply(res);
    expect(body.error?.code).toBe(-32603);
    expect(body.error?.message).toBe("Subscription limit reached");
  });

  it("would hold the listen stream open with the SDK default", async () => {
    // Documents why maxSubscriptions: 0 is needed: the default router opens the
    // SSE stream before it narrows the filter, listChanged: false or not.
    const res = await handler({ legacy: MCP_HANDLER_OPTIONS.legacy }).fetch(
      modern("subscriptions/listen", { notifications: { toolsListChanged: true } }),
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel();
  });

  it("still answers tools/list on the 2026-07-28 path", async () => {
    const res = await handler(MCP_HANDLER_OPTIONS).fetch(modern("tools/list"));
    expect(res.status).toBe(200);
    const body = await reply(res);
    expect(body.error).toBeUndefined();
    const tools = body.result?.tools as Array<{ name: string }>;
    expect(tools.map((t) => t.name)).toEqual(["ping"]);
  });

  it("still answers a legacy initialize, advertising no tool-list notifications", async () => {
    const res = await handler(MCP_HANDLER_OPTIONS).fetch(
      post({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test-client", version: "0.0.0" },
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await reply(res);
    expect(body.error).toBeUndefined();
    const capabilities = body.result?.capabilities as { tools?: { listChanged?: boolean } };
    expect(capabilities.tools?.listChanged).toBe(false);
  });
});

describe("jsonRpcMethods", () => {
  it("names the method of a single message", () => {
    expect(jsonRpcMethods(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call" }))).toEqual([
      "tools/call",
    ]);
  });

  it("names every method in a batch, in order", () => {
    const batch = [
      { jsonrpc: "2.0", id: 1, method: "initialize" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, result: {} },
    ];
    expect(jsonRpcMethods(JSON.stringify(batch))).toEqual([
      "initialize",
      "notifications/initialized",
      "(no method)",
    ]);
    expect(jsonRpcMethods("[]")).toEqual(["(empty batch)"]);
  });

  it("never throws on malformed or oversized bodies", () => {
    expect(jsonRpcMethods("{not json")).toEqual(["(malformed)"]);
    expect(jsonRpcMethods("")).toEqual(["(malformed)"]);
    expect(jsonRpcMethods("42")).toEqual(["(no method)"]);
    expect(jsonRpcMethods('{"method": 7}')).toEqual(["(no method)"]);
    const big = JSON.stringify({ method: "tools/call", params: { x: "a".repeat(MCP_LOG_BODY_LIMIT) } });
    expect(jsonRpcMethods(big)).toEqual(["(oversized)"]);
    expect(jsonRpcMethods('{"method":"ping"}', 5)).toEqual(["(oversized)"]);
  });
});
