import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { isPublicRoutableHost } from "@better-auth/core/utils/host";

// Fetches an MCP client's Client ID Metadata Document (the client_id is an
// HTTPS URL, e.g. https://claude.ai/oauth/mcp-oauth-client-metadata).
//
// This replaces `fetchClientMetadataResource` from `@better-auth/cimd/node`
// 1.7.2, whose DNS-pinning `lookup` callback hands Node a single address
// while Node ≥ 20's connect path asks for an array (`all: true`) — every
// fetch then dies with "Invalid IP address: undefined", which the plugin
// reports as "Failed to fetch metadata document (network error or redirect
// blocked)". Same protections as the original: HTTPS only, every DNS answer
// must be public-routable (no SSRF into private ranges), the chosen address
// is pinned for the connection while the hostname stays the Host header,
// SNI and certificate identity, and redirects are returned, never followed.
// IPv4 is preferred when available because serverless egress is IPv4-only.

const BODY_FORBIDDEN_STATUSES = new Set([204, 205, 304]);

type Address = { address: string; family: number };

function toHeaders(raw: Record<string, string | string[] | undefined>): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else if (value !== undefined) headers.append(name, value);
  }
  return headers;
}

export async function resolvePinnedAddress(hostname: string): Promise<Address> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    if (!isPublicRoutableHost(bare)) {
      throw new TypeError("metadata host must be a public-routable address");
    }
    return { address: bare, family: isIP(bare) };
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new TypeError("metadata hostname returned no DNS addresses");
  }
  for (const a of addresses) {
    if (!isPublicRoutableHost(a.address)) {
      throw new TypeError("metadata hostname must resolve only to public-routable addresses");
    }
  }
  return addresses.find((a) => a.family === 4) ?? addresses[0];
}

export const fetchClientMetadataResource: ClientMetadataResourceFetch = async (
  input,
  init,
) => {
  const webRequest = new Request(input, init);
  const url = new URL(webRequest.url);
  if (url.protocol !== "https:") {
    throw new TypeError("CIMD transport requires an HTTPS URL");
  }
  if (webRequest.method !== "GET" && webRequest.method !== "HEAD") {
    throw new TypeError("CIMD transport supports only GET and HEAD");
  }

  const pinned = await resolvePinnedAddress(url.hostname);
  const headers = Object.fromEntries(webRequest.headers.entries());
  headers.host = url.host;
  const signal =
    init?.signal ?? (input instanceof Request ? input.signal : webRequest.signal);
  const isLiteralIp = isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0;

  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        agent: false,
        headers,
        method: webRequest.method,
        servername: isLiteralIp ? undefined : url.hostname,
        signal,
        // Node calls this with `all: true` on its multi-address connect path
        // and without it on the legacy path; answer both shapes.
        lookup: ((_hostname: string, options: unknown, callback: unknown) => {
          const cb = callback as (
            err: null,
            address: string | Address[],
            family?: number,
          ) => void;
          if (options && typeof options === "object" && (options as { all?: boolean }).all) {
            cb(null, [pinned]);
          } else {
            cb(null, pinned.address, pinned.family);
          }
        }) as never,
      },
      (response) => {
        const status = response.statusCode ?? 500;
        const body =
          webRequest.method === "HEAD" || BODY_FORBIDDEN_STATUSES.has(status)
            ? null
            : (Readable.toWeb(response) as ReadableStream<Uint8Array>);
        resolve(
          new Response(body, {
            headers: toHeaders(response.headers),
            status,
            statusText: response.statusMessage,
          }),
        );
      },
    );
    req.once("error", reject);
    req.end();
  });
};
