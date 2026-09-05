// MCP deployment constants. Everything here is fixed when the process starts
// (the auth plugins read it once), so it comes from environment variables;
// runtime knobs that can't widen access live in app_setting instead
// (src/lib/mcp-settings.ts). See plans/mcp-server.md §4.

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * RFC 8707 resource identifier of the MCP server: access tokens are
 * audience-bound to it and it is advertised in the protected-resource
 * metadata. Must be HTTPS except on localhost/loopback.
 */
export const MCP_RESOURCE_URL =
  process.env.MCP_RESOURCE_URL?.trim() || `${appUrl}/api/mcp`;

/**
 * Whether MCP clients may register themselves (RFC 7591 dynamic client
 * registration) without a session. MCP 2026-07-28 clients identify
 * themselves with Client ID Metadata Documents instead; this stays on until
 * the Admin → MCP client list shows nothing still relying on it.
 */
export const MCP_ALLOW_DCR =
  process.env.MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION?.trim().toLowerCase() !==
  "false";

/** The single scope v1 grants: search and read guides the user can see. */
export const MCP_SCOPE = "guides:read";

export const MCP_ACCESS_TOKEN_SECONDS = 60 * 60;
export const MCP_REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;

/** Relative paths (under NEXT_PUBLIC_APP_URL) that staff and admins need. */
export const MCP_PATHS = {
  endpoint: "/api/mcp",
  protectedResourceMetadata: "/.well-known/oauth-protected-resource/api/mcp",
  authorizationServerMetadata: "/.well-known/oauth-authorization-server/api/auth",
  jwks: "/api/auth/jwks",
} as const;
