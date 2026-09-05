import { discoveryRoute } from "@/lib/mcp/discovery";

// RFC 9728 protected-resource metadata (root form).
const handler = discoveryRoute();
export { handler as GET, handler as HEAD };
