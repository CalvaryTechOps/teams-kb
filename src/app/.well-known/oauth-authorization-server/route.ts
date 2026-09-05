import { discoveryRoute } from "@/lib/mcp/discovery";

// RFC 8414 authorization-server metadata at the bare root path, for clients
// that don't insert the issuer path (/api/auth).
const handler = discoveryRoute("/.well-known/oauth-authorization-server/api/auth");
export { handler as GET, handler as HEAD };
