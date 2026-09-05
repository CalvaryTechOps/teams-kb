import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The MCP create_draft tool parses Markdown with @blocknote/server-util,
  // which imports @blocknote/react and jsdom. Bundled into a route handler it
  // is evaluated against React's server-only build (no createContext) and
  // throws on import; loaded by Node from node_modules it gets the full React
  // and jsdom's own module layout. The build still traces and ships it.
  serverExternalPackages: ["@blocknote/server-util"],
};

export default nextConfig;
