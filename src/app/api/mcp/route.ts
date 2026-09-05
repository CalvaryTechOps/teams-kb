import { createMcpHandler } from "@modelcontextprotocol/server";
import { requireMcpAuth } from "@better-auth/mcp";
import { auth } from "@/lib/auth";
import { MCP_RESOURCE_URL, MCP_SCOPE } from "@/lib/mcp/config";
import { buildKbServer } from "@/lib/mcp/server";
import type { McpToolContext } from "@/lib/mcp/tools";
import { getMcpSettings } from "@/lib/mcp-settings.server";
import { getUserAccessById } from "@/lib/permissions";

// The MCP endpoint (plans/mcp-server.md §3). requireMcpAuth verifies the
// bearer JWT against /api/auth/jwks (signature, issuer, audience = the
// resource URL, expiry, scope) and answers unauthenticated calls with the
// RFC 9728 challenge that starts the client's OAuth flow. Only POST exists:
// the 2026-07-28 protocol is stateless per request, and the legacy fallback
// is stateless too, so GET/DELETE get Next's 405.

export const maxDuration = 30;

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const mcpHandler = createMcpHandler(
  ({ authInfo }) => {
    const ctx = authInfo?.extra?.toolContext as McpToolContext | undefined;
    if (!ctx) throw new Error("MCP tool context missing from authInfo");
    return buildKbServer(ctx);
  },
  {
    // Accept 2025-era clients for now; tighten to "reject" once every
    // client in use speaks 2026-07-28 (plan open question 1).
    legacy: "stateless",
    onerror: (err) => console.error("mcp handler", err),
  },
);

function jsonRpcError(status: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message }, id: null },
    { status },
  );
}

export const POST = requireMcpAuth(
  auth,
  async (request, claims) => {
    const settings = await getMcpSettings();
    if (!settings.enabled) {
      return jsonRpcError(503, "MCP access is turned off for this knowledge base.");
    }

    const userId = typeof claims.sub === "string" ? claims.sub : "";
    const access = userId ? await getUserAccessById(userId) : null;
    if (!access) return jsonRpcError(401, "This account no longer exists.");

    const token =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const scope = typeof claims.scope === "string" ? claims.scope : "";
    const clientId =
      typeof claims.client_id === "string"
        ? claims.client_id
        : typeof claims.azp === "string"
          ? claims.azp
          : "";
    const toolContext: McpToolContext = { access, settings, appUrl };

    return mcpHandler.fetch(request, {
      authInfo: {
        token,
        clientId,
        scopes: scope.split(" ").filter(Boolean),
        expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
        extra: { toolContext },
      },
    });
  },
  { resource: MCP_RESOURCE_URL, requiredScopes: [MCP_SCOPE] },
);
