// Minimal Microsoft Graph client using client-credentials flow.
// Requires GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET with
// application permissions: GroupMember.Read.All, User.Read.All.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

let cachedToken: { token: string; expiresAt: number } | null = null;

export function graphConfigured(): boolean {
  return Boolean(
    process.env.GRAPH_TENANT_ID &&
      process.env.GRAPH_CLIENT_ID &&
      process.env.GRAPH_CLIENT_SECRET,
  );
}

async function getGraphToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const tenantId = process.env.GRAPH_TENANT_ID;
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GRAPH_CLIENT_ID!,
        client_secret: process.env.GRAPH_CLIENT_SECRET!,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Graph token request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function graphFetch<T>(url: string): Promise<T> {
  const token = await getGraphToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Graph GET ${url} failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/** GET a Graph collection, following @odata.nextLink pagination. */
export async function graphGetAll<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | undefined = `${GRAPH_BASE}${path}`;
  while (url) {
    const page: { value: T[]; "@odata.nextLink"?: string } = await graphFetch(url);
    results.push(...page.value);
    url = page["@odata.nextLink"];
  }
  return results;
}

export type GraphGroup = {
  id: string;
  displayName: string;
  description: string | null;
  mail: string | null;
  // Contains "Team" when the M365 group is Teams-enabled.
  resourceProvisioningOptions?: string[];
};

/** Only Teams-enabled groups exist for the KB — plain M365/security groups don't. */
export function isTeamsGroup(g: GraphGroup): boolean {
  return g.resourceProvisioningOptions?.includes("Team") ?? false;
}

export type GraphDirectoryObject = { id: string };
