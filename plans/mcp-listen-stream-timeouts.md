# Plan: Stop MCP `subscriptions/listen` streams from timing out the function

**Status: not started — requested 2026-09-08.**
To implement, ask Claude to "execute the mcp-listen-stream-timeouts plan".
Resolve the open questions at the bottom first (or answer them when Claude
asks).

## Problem

Vercel's production logs show recurring bursts of

```
Vercel Runtime Timeout Error: Task timed out after 30 seconds
```

on `POST /api/mcp`: six on 2026-09-07 around 01:16–01:19 UTC, six on
2026-09-08 at 16:12–16:14 UTC on the deployment that was live then, and six
more at 16:26–16:28 UTC on the deployment that replaced it. Each burst is
exactly six requests roughly 31 seconds apart, each preceded by successful
MCP calls in the same minute, and each logged with HTTP status 200 — the
response had already started streaming when the function was killed. Page
requests on the same deployment were healthy during the 16:26 burst, and a
live tool call against the connector afterwards answered in well under a
second, so this is not the database problem covered by the
`db-pool-no-connection-reuse` plan. Every burst costs six 30-second function
executions and shows the connecting client a flaky server.

Most likely cause (not yet confirmed; see step 1): the 2026-07-28 protocol's
`subscriptions/listen` request. `@modelcontextprotocol/server`'s
`createMcpHandler` answers it by opening a server-sent-events stream that
stays open, writing `: keepalive` frames every 15 seconds, until the client
disconnects (`createListenRouter` in the package's `dist/mcp-*.mjs`). On a
Vercel function with `maxDuration = 30` that stream can never end
gracefully: the platform kills it at 30 s, the client reconnects, and the
cycle repeats until the client gives up — six attempts, in Claude.ai's case.

Why a client asks: `McpServer.registerTool` advertises
`tools: { listChanged: true }` unless the server was constructed with an
explicit value (`setToolRequestHandlers` in the same file). A modern-era
client reads that bit and opens a listen stream to be told about tool-list
changes. Our tool list is fixed per request, so we will never send one.

What exists and matters here:

- `src/app/api/mcp/route.ts`: `export const maxDuration = 30`; calls
  `createMcpHandler(factory, { legacy: "stateless", onerror })` and wraps it
  in `requireMcpAuth`. Only `POST` is exported.
- `src/lib/mcp/server.ts` `buildKbServer`: `new McpServer({ name, version },
  { instructions })` — no explicit `capabilities`, so the default
  `listChanged: true` applies.
- `createMcpHandler` options (`dist/createMcpHandler-*.d.mts`):
  `maxSubscriptions` — "Reject a new `subscriptions/listen` with `-32603`
  'Subscription limit reached' (in-band, HTTP 200, before the ack) when this
  many subscription streams are already open on this handler", default 1024;
  `keepAliveMs`, default 15 000.
- Vercel request logs carry no request body, so the JSON-RPC method behind a
  timeout is invisible today. App-side logging is the only way to confirm.

## Design

Three small changes, shipped together:

1. **Confirm and keep visibility.** In `route.ts`, before handing the
   request to `mcpHandler.fetch`, read the JSON-RPC method name(s) from a
   clone of the body (single message or batch; cap the read at the existing
   `MCP_MAX_MARKDOWN_BYTES`-style limit and never log params) and
   `console.info("mcp request", { methods })`. One line per call, visible in
   `vercel logs`, so the next burst names its method. Cheap enough to keep
   permanently (open question 2).
2. **Stop inviting listen streams.** Construct the server with
   `capabilities: { tools: { listChanged: false } }` so the advertised
   capability set matches reality. Well-behaved modern clients then have
   nothing to subscribe to and skip `subscriptions/listen`.
3. **Refuse any listen stream that arrives anyway.** Pass
   `maxSubscriptions: 0` to `createMcpHandler`. The router then answers a
   listen request immediately with the in-band JSON-RPC error the SDK
   defines for this case instead of holding a stream open until the platform
   kills it. Note that with `maxSubscriptions` left at its default, the
   stream is held open even when no filter field is honored — the router
   opens the stream first and narrows the filter afterwards — so change 2 on
   its own is not enough.

Rejected alternatives:

- **Raise `maxDuration`.** Moves the kill from 30 s to 300 s (or 800 s); the
  stream still cannot end and each attempt costs ten times more.
- **Host the stream somewhere stateful.** Correct in principle, but the KB
  has no long-lived process, and the app has nothing to publish on such a
  stream.
- **`legacy: "reject"`.** Unrelated; the listen request is modern-era
  traffic.

## Steps

1. Branch `feat/mcp-listen-stream-timeouts` off `main`.
2. `src/app/api/mcp/route.ts`: add the method-name logging (step 1 of the
   design) with a bounded body read and a try/catch that never blocks the
   request; add `maxSubscriptions: 0` to the `createMcpHandler` options with a
   comment explaining the 30 s limit.
3. `src/lib/mcp/server.ts`: pass `capabilities: { tools: { listChanged:
   false } }` in the `McpServer` options (verify the option name against
   `ServerOptions` in `dist/createMcpHandler-*.d.mts`).
4. Unit test (vitest, alongside `src/lib/mcp/shape.test.ts`): build the
   handler with the same options and assert that a `subscriptions/listen`
   request gets an immediate JSON response with error code `-32603`, and that
   `initialize` / `tools/list` still succeed. Add a test for the method
   extractor covering single messages, batches, and oversized or malformed
   bodies.
5. Update `plans/completed/mcp-server.md`'s open question about legacy
   clients only if the answer changed (it should not).
6. Local verification: `npm run lint`, `npx tsc --noEmit`, `npm test`,
   `npm run build`; run `npm run dev` and exercise a tool call through an MCP
   client (the Claude.ai connector against a tunnel, or the MCP Inspector) to
   confirm `initialize`, `tools/list` and a tool call still work and the log
   line appears.
7. Commit on the feature branch. (No push — Chris tests and asks.)

How we will know it worked, after Chris merges: `vercel logs --environment
production --query "/api/mcp" --since 3d` shows `mcp request` info lines for
every call and no further `Task timed out` entries; if a burst does recur,
the logged method identifies what to fix next.

## Open questions

1. Ship diagnostics and fix together (recommended — the fix is two option
   flags and the diagnostics stay useful), or deploy only the logging first
   and wait for one more burst to confirm the method before changing
   behaviour?
2. Keep the per-request method log permanently (recommended; one short info
   line per call, no payloads), or remove it once the diagnosis is confirmed?
3. Is the Claude.ai connector the only MCP client in use today? If another
   client relies on `tools/list_changed` notifications, say so — the answer
   changes nothing about the fix but belongs in the Admin → MCP page's help
   text.
