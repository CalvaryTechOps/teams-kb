import "server-only";
import { auth } from "@/lib/auth";

// OAuth discovery documents live at the site root (RFC 8414 / RFC 9728), but
// better-auth only sees requests under /api/auth. These route helpers hand a
// root-level request to auth.handler, whose plugins match the well-known
// paths by full pathname: the MCP plugin serves
// /.well-known/oauth-protected-resource[/api/mcp] and the provider serves
// /.well-known/oauth-authorization-server/api/auth. The bare
// /.well-known/oauth-authorization-server (older clients) is rewritten to the
// issuer-inserted path before it goes in.

export function discoveryRoute(rewriteTo?: string) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (rewriteTo) url.pathname = rewriteTo;
    return auth.handler(
      new Request(url, { method: request.method, headers: request.headers }),
    );
  };
}
