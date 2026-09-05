import { discoveryRoute } from "@/lib/mcp/discovery";

// RFC 8414 authorization-server metadata, issuer-path-inserted form.
const handler = discoveryRoute();
export { handler as GET, handler as HEAD };
