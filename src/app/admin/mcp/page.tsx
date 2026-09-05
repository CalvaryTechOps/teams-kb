import Link from "next/link";
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  isNull,
  max,
  or,
} from "drizzle-orm";
import { db } from "@/db";
import {
  jwks,
  oauthAccessToken,
  oauthClient,
  oauthRefreshToken,
  user,
} from "@/db/schema";
import { ConfirmForm } from "@/components/confirm-form";
import {
  MCP_ALLOW_DCR,
  MCP_PATHS,
  MCP_RESOURCE_URL,
  MCP_WRITE_SCOPE,
} from "@/lib/mcp/config";
import {
  MCP_INSTRUCTIONS_MAX_LENGTH,
  MCP_MAX_RESULTS_MAX,
  MCP_MAX_RESULTS_MIN,
  MCP_SETTING_DEFAULTS,
} from "@/lib/mcp-settings";
import { getMcpSettings } from "@/lib/mcp-settings.server";
import { CopyButton } from "./copy-button";
import {
  resetMcpSettings,
  revokeClientGrants,
  revokeGrant,
  saveMcpSettings,
  setClientDisabled,
} from "./actions";

// Admin → MCP (plans/mcp-server.md §5): status and readiness, the URLs and
// snippets staff need to connect an agent, the runtime settings, and the
// connected clients / grants with disable and revoke controls.

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
const smallButton =
  "h-7 rounded-md border px-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-50";

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className={ok ? "text-green-700" : "text-amber-600"} aria-hidden>
        {ok ? "✓" : "!"}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Snippet({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-gray-600">{title}</span>
        <CopyButton text={text} />
      </div>
      <pre className="mt-1 overflow-x-auto rounded-md bg-gray-50 px-3 py-2 text-xs leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

function truncate(s: string, n = 28): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export default async function AdminMcpPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const now = new Date();
  const liveGrant = and(
    isNull(oauthRefreshToken.revoked),
    or(isNull(oauthRefreshToken.expiresAt), gt(oauthRefreshToken.expiresAt, now)),
  );

  const [settings, params, [keyCount], clients, grantStats, lastIssued, grants] =
    await Promise.all([
      getMcpSettings(),
      searchParams,
      db.select({ n: count() }).from(jwks),
      db
        .select({
          clientId: oauthClient.clientId,
          name: oauthClient.name,
          uri: oauthClient.uri,
          discoveryId: oauthClient.clientDiscoveryId,
          disabled: oauthClient.disabled,
          createdAt: oauthClient.createdAt,
        })
        .from(oauthClient)
        .orderBy(desc(oauthClient.createdAt)),
      db
        .select({
          clientId: oauthRefreshToken.clientId,
          users: countDistinct(oauthRefreshToken.userId),
        })
        .from(oauthRefreshToken)
        .where(liveGrant)
        .groupBy(oauthRefreshToken.clientId),
      db
        .select({
          clientId: oauthAccessToken.clientId,
          last: max(oauthAccessToken.createdAt),
        })
        .from(oauthAccessToken)
        .groupBy(oauthAccessToken.clientId),
      db
        .select({
          id: oauthRefreshToken.id,
          userName: user.name,
          userEmail: user.email,
          clientId: oauthRefreshToken.clientId,
          clientName: oauthClient.name,
          createdAt: oauthRefreshToken.createdAt,
          expiresAt: oauthRefreshToken.expiresAt,
          rotatedAt: oauthRefreshToken.rotatedAt,
          scopes: oauthRefreshToken.scopes,
        })
        .from(oauthRefreshToken)
        .innerJoin(user, eq(user.id, oauthRefreshToken.userId))
        .innerJoin(oauthClient, eq(oauthClient.clientId, oauthRefreshToken.clientId))
        .where(liveGrant)
        .orderBy(desc(oauthRefreshToken.createdAt)),
    ]);

  const usersByClient = new Map(grantStats.map((g) => [g.clientId, Number(g.users)]));
  const lastByClient = new Map(lastIssued.map((l) => [l.clientId, l.last]));

  const resourceIsHttps = MCP_RESOURCE_URL.startsWith("https://");
  const resourceIsLoopback = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(
    MCP_RESOURCE_URL,
  );
  const endpointUrl = `${appUrl}${MCP_PATHS.endpoint}`;
  const isCustom = {
    enabled: settings.enabled !== MCP_SETTING_DEFAULTS.enabled,
    instructions: settings.instructions !== MCP_SETTING_DEFAULTS.instructions,
    maxResults: settings.maxResults !== MCP_SETTING_DEFAULTS.maxResults,
    draftsEnabled: settings.draftsEnabled !== MCP_SETTING_DEFAULTS.draftsEnabled,
  };
  const anyCustom = Object.values(isCustom).some(Boolean);

  const messages: Record<string, string> = {
    saved: "Saved.",
    reset: "Reset to defaults.",
    disabled: "Client disabled. It can no longer get tokens.",
    enabled: "Client re-enabled.",
    revoked: "Revoked. Existing access tokens stop at their expiry (within an hour).",
  };

  return (
    <div className="max-w-3xl space-y-10">
      <section>
        <h2 className="text-lg font-semibold">MCP</h2>
        <p className="mt-1 text-sm text-gray-500">
          Staff can connect an AI agent (Claude, Claude Code, Cursor…) to the
          knowledge base over the Model Context Protocol. Each person signs in
          with their work account and approves once; the agent then searches
          and reads only the published guides that person can see, and — when
          allowed below — creates unpublished drafts in that person’s own
          departments. It never publishes.
        </p>

        {params.ok && messages[params.ok] && (
          <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            {messages[params.ok]}
          </p>
        )}
        {params.error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {params.error}
          </p>
        )}

        <ul className="mt-4 space-y-1.5 text-sm">
          <Check ok={settings.enabled}>
            {settings.enabled
              ? "MCP access is on."
              : "MCP access is off — agents get a 503 until it is turned back on below."}
          </Check>
          <Check ok={resourceIsHttps || resourceIsLoopback}>
            Resource URL <code className="text-xs">{MCP_RESOURCE_URL}</code>
            {resourceIsHttps
              ? ""
              : resourceIsLoopback
                ? " (plain http is accepted for local development only)"
                : " — must be HTTPS; set NEXT_PUBLIC_APP_URL or MCP_RESOURCE_URL"}
          </Check>
          <Check ok={(keyCount?.n ?? 0) > 0}>
            {(keyCount?.n ?? 0) > 0
              ? "Token signing key present."
              : "No signing key yet — one is created on the first authorization."}
          </Check>
          <Check ok>
            Draft creation by agents is{" "}
            <strong>{settings.draftsEnabled ? "on" : "off"}</strong>.
            {settings.draftsEnabled
              ? " Drafts go through the normal review path; connections approved before this existed must reconnect once to use it."
              : " Turn it on below to let agents create drafts."}
          </Check>
          <Check ok>
            Dynamic client registration is{" "}
            <strong>{MCP_ALLOW_DCR ? "on" : "off"}</strong> (environment variable
            MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION). Newer clients identify
            themselves with a metadata document instead; turn this off once the
            client list below shows none registered dynamically.
          </Check>
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Connect an agent</h3>
        <p className="mt-1 text-sm text-gray-500">
          Give staff the server URL. Their agent opens the sign-in page, then a
          consent screen; nothing to paste or configure beyond the URL.
        </p>
        <div className="mt-4 space-y-4">
          <Snippet title="MCP server URL" text={endpointUrl} />
          <Snippet
            title="Claude Code"
            text={`claude mcp add --transport http kb ${endpointUrl}`}
          />
          <Snippet
            title="Generic mcpServers JSON (Cursor, Claude Desktop and others)"
            text={JSON.stringify(
              { mcpServers: { kb: { type: "http", url: endpointUrl } } },
              null,
              2,
            )}
          />
          <p className="text-xs text-gray-500">
            Claude.ai: Settings → Connectors → Add custom connector → paste the
            server URL. Discovery documents, for troubleshooting:{" "}
            <Link href={MCP_PATHS.protectedResourceMetadata} className="text-blue-600 hover:underline">
              protected resource
            </Link>
            {" · "}
            <Link href={MCP_PATHS.authorizationServerMetadata} className="text-blue-600 hover:underline">
              authorization server
            </Link>
            {" · "}
            <Link href={MCP_PATHS.jwks} className="text-blue-600 hover:underline">
              signing keys
            </Link>
            .
          </p>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Settings</h3>
          {anyCustom && (
            <form action={resetMcpSettings}>
              <button type="submit" className="text-xs text-gray-500 hover:underline">
                Reset all to defaults
              </button>
            </form>
          )}
        </div>
        <form action={saveMcpSettings} className="mt-3 space-y-5">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={settings.enabled}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Enabled</span>
              <span className="block text-xs text-gray-500">
                Kill switch. When off, tools answer 503; sign-in and token
                refresh keep working so agents recover the moment it is back on.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="draftsEnabled"
              defaultChecked={settings.draftsEnabled}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Allow agents to create drafts</span>
              <span className="block text-xs text-gray-500">
                Enables the create_draft tool: a new, unpublished draft from
                Markdown in a department the person belongs to (any department
                for admins). Reading is unaffected either way.
              </span>
            </span>
          </label>

          <div>
            <label htmlFor="instructions" className="text-sm font-medium">
              Instructions for agents
              <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                {isCustom.instructions ? "customized" : "default"}
              </span>
            </label>
            <p className="text-xs text-gray-500">
              Sent to the agent when it connects; tell it how to treat the
              knowledge base. Blank uses the default.
            </p>
            <textarea
              id="instructions"
              name="instructions"
              rows={4}
              maxLength={MCP_INSTRUCTIONS_MAX_LENGTH}
              defaultValue={isCustom.instructions ? settings.instructions : ""}
              placeholder={MCP_SETTING_DEFAULTS.instructions}
              className={inputClass}
            />
          </div>

          <div className="max-w-xs">
            <label htmlFor="maxResults" className="text-sm font-medium">
              Max results per call
              <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                {isCustom.maxResults ? "customized" : "default"}
              </span>
            </label>
            <p className="text-xs text-gray-500">
              Cap for list and search tools ({MCP_MAX_RESULTS_MIN}–{MCP_MAX_RESULTS_MAX}).
              Blank uses {MCP_SETTING_DEFAULTS.maxResults}.
            </p>
            <input
              id="maxResults"
              name="maxResults"
              type="number"
              min={MCP_MAX_RESULTS_MIN}
              max={MCP_MAX_RESULTS_MAX}
              defaultValue={isCustom.maxResults ? settings.maxResults : ""}
              placeholder={String(MCP_SETTING_DEFAULTS.maxResults)}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save
          </button>
        </form>
      </section>

      <section>
        <h3 className="font-semibold">Connected clients</h3>
        <p className="mt-1 text-sm text-gray-500">
          Every agent application that has registered. Disabling a client
          blocks new sign-ins and token refreshes for everyone using it.
        </p>
        {clients.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed p-6 text-sm text-gray-500">
            No agents have connected yet.
          </p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-gray-500">
              <tr>
                <th className="py-2 pr-4">Client</th>
                <th className="py-2 pr-4">Registered via</th>
                <th className="py-2 pr-4">Staff</th>
                <th className="py-2 pr-4">Last token</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const users = usersByClient.get(c.clientId) ?? 0;
                const last = lastByClient.get(c.clientId) ?? null;
                return (
                  <tr key={c.clientId} className={`border-t ${c.disabled ? "text-gray-400" : ""}`}>
                    <td className="py-2 pr-4">
                      <div className="font-medium">
                        {c.name?.trim() || "Unnamed client"}
                        {c.disabled && (
                          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-normal text-red-800">
                            disabled
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500" title={c.clientId}>
                        {c.uri ? `${c.uri} · ` : ""}
                        {truncate(c.clientId)}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      {c.discoveryId ? "Metadata document" : "Dynamic registration"}
                      <div className="text-xs text-gray-500">
                        {c.createdAt ? c.createdAt.toLocaleDateString() : "—"}
                      </div>
                    </td>
                    <td className="py-2 pr-4">{users}</td>
                    <td className="py-2 pr-4 text-gray-500">
                      {last ? last.toLocaleString() : "—"}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <form action={setClientDisabled}>
                          <input type="hidden" name="clientId" value={c.clientId} />
                          <input type="hidden" name="disabled" value={c.disabled ? "false" : "true"} />
                          <button type="submit" className={smallButton}>
                            {c.disabled ? "Enable" : "Disable"}
                          </button>
                        </form>
                        {users > 0 && (
                          <ConfirmForm
                            action={revokeClientGrants}
                            message={`Revoke every grant for “${c.name?.trim() || c.clientId}”? ${users} staff member${users === 1 ? "" : "s"} will have to reconnect.`}
                          >
                            <input type="hidden" name="clientId" value={c.clientId} />
                            <button type="submit" className={`${smallButton} text-red-700`}>
                              Revoke all grants
                            </button>
                          </ConfirmForm>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3 className="font-semibold">Grants</h3>
        <p className="mt-1 text-sm text-gray-500">
          Who has connected which agent. Revoking a grant disconnects that one
          agent for that one person; they can reconnect any time.
        </p>
        {grants.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed p-6 text-sm text-gray-500">
            No active grants.
          </p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-gray-500">
              <tr>
                <th className="py-2 pr-4">Staff member</th>
                <th className="py-2 pr-4">Client</th>
                <th className="py-2 pr-4">Can</th>
                <th className="py-2 pr-4">Granted</th>
                <th className="py-2 pr-4">Last refreshed</th>
                <th className="py-2 pr-4">Expires</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id} className="border-t">
                  <td className="py-2 pr-4">
                    <div>{g.userName}</div>
                    <div className="text-xs text-gray-500">{g.userEmail}</div>
                  </td>
                  <td className="py-2 pr-4">{g.clientName?.trim() || truncate(g.clientId)}</td>
                  <td className="py-2 pr-4 text-gray-500" title={g.scopes.join(" ")}>
                    {g.scopes.includes(MCP_WRITE_SCOPE) ? "Read, draft" : "Read"}
                  </td>
                  <td className="py-2 pr-4 text-gray-500">
                    {g.createdAt ? g.createdAt.toLocaleString() : "—"}
                  </td>
                  <td className="py-2 pr-4 text-gray-500">
                    {g.rotatedAt ? g.rotatedAt.toLocaleString() : "—"}
                  </td>
                  <td className="py-2 pr-4 text-gray-500">
                    {g.expiresAt ? g.expiresAt.toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2">
                    <ConfirmForm
                      action={revokeGrant}
                      message={`Disconnect “${g.clientName?.trim() || g.clientId}” for ${g.userName}?`}
                    >
                      <input type="hidden" name="grantId" value={g.id} />
                      <button type="submit" className={`${smallButton} text-red-700`}>
                        Revoke
                      </button>
                    </ConfirmForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
