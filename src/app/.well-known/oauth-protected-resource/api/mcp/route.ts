import { discoveryRoute } from "@/lib/mcp/discovery";

// RFC 9728 protected-resource metadata, path-suffixed for /api/mcp.
const handler = discoveryRoute();
export { handler as GET, handler as HEAD };
