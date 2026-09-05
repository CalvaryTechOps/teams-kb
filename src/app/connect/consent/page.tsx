import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthClient } from "@/db/schema";
import { BrandMark } from "@/components/brand-mark";
import { APP_TITLE } from "@/lib/branding";
import { getSession, requireAccess } from "@/lib/permissions";
import { ConsentActions } from "./consent-actions";

// OAuth consent page for MCP connections (plans/mcp-server.md §1c). The
// provider redirects here, signed in, with the authorization query in the
// URL; the page names the agent and what it may do, and ConsentActions sends
// the decision back. Reached only through that redirect — a stray visit
// simply shows an expired-request message.

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

const SCOPE_TEXT: Record<string, string> = {
  "guides:read":
    "Search and read guides you can already see in the knowledge base",
  "guides:write":
    "Create draft guides in departments you belong to — drafts stay unpublished until someone reviews them in the knowledge base",
  openid: "Confirm who you are",
  profile: "See your name",
  email: "See your work email address",
  offline_access:
    "Stay connected without signing in again, until you or an admin revoke it",
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccess();
  const [session, params] = await Promise.all([getSession(), searchParams]);
  const clientId = first(params.client_id);
  const scopes = first(params.scope).split(" ").filter(Boolean);

  const client = clientId
    ? (
        await db
          .select({
            name: oauthClient.name,
            uri: oauthClient.uri,
            disabled: oauthClient.disabled,
          })
          .from(oauthClient)
          .where(eq(oauthClient.clientId, clientId))
          .limit(1)
      ).at(0)
    : undefined;

  const usable = Boolean(client) && !client?.disabled && Boolean(first(params.sig));
  const clientName = client?.name?.trim() || "An AI agent";
  const clientHost = (() => {
    try {
      return client?.uri ? new URL(client.uri).host : null;
    } catch {
      return null;
    }
  })();

  return (
    <main className="flex min-h-screen items-center justify-center bg-grey-50 p-8">
      <div className="w-full max-w-[440px]">
        <div className="mb-6 flex justify-center rounded-2xl bg-ink px-6 py-4">
          <BrandMark size="hero" />
        </div>
        <div className="rounded-2xl border border-grey-200 bg-white px-9 py-10 shadow-md">
          <h1 className="text-[26px] font-black tracking-tight text-ink">
            Connect to {APP_TITLE}?
          </h1>

          {usable ? (
            <>
              <p className="mt-3 text-[15px] leading-relaxed text-grey-600">
                <strong className="text-ink">{clientName}</strong>
                {clientHost && (
                  <span className="text-grey-500"> ({clientHost})</span>
                )}{" "}
                wants to use the knowledge base as{" "}
                <strong className="text-ink">
                  {session?.user.name ?? "you"}
                </strong>
                . It will be able to:
              </p>
              <ul className="mt-4 space-y-2 text-[14px] leading-relaxed text-grey-700">
                {(scopes.length ? scopes : ["guides:read"]).map((s) => (
                  <li key={s} className="flex gap-2.5">
                    <span aria-hidden className="mt-[3px] text-cyan-600">
                      ✓
                    </span>
                    <span>{SCOPE_TEXT[s] ?? s}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] leading-relaxed text-grey-500">
                It never sees more than you can, and it can’t publish or change
                existing guides. An admin can disconnect it at any time.
              </p>
              <ConsentActions />
            </>
          ) : (
            <p className="mt-3 text-[15px] leading-relaxed text-grey-600">
              {client?.disabled
                ? "This agent has been disabled by an administrator."
                : "This connection request is missing or has expired. Start the connection again from your AI agent."}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
