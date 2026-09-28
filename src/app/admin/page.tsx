import Link from "next/link";
import { count, desc } from "drizzle-orm";
import { db } from "@/db";
import { oauthClient, syncRun, tag } from "@/db/schema";
import { attentionCounts } from "@/lib/admin-attention";
import { attentionTiles } from "@/lib/admin-attention-tiles";

// Admin home: what is waiting on an admin (as tiles, first), the pages to
// manage things from, and the recent directory syncs.

export default async function AdminDashboard() {
  const [attention, recentRuns, [tagCount], [mcpClientCount]] =
    await Promise.all([
      attentionCounts(),
      db.select().from(syncRun).orderBy(desc(syncRun.startedAt)).limit(10),
      db.select({ n: count() }).from(tag),
      db.select({ n: count() }).from(oauthClient),
    ]);
  const tiles = attentionTiles(attention);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold">Needs attention</h2>
        <div className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-4">
          {tiles.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className="rounded-xl border border-border bg-surface-raised p-5 shadow-xs transition-shadow hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:shadow-focus"
            >
              <div className="text-sm font-medium text-fg-muted">{t.label}</div>
              {/* The number and caption carry the state; colour only
                  reinforces it, so zero reads as quiet without a badge. */}
              <div
                className={`mt-1 text-3xl font-semibold ${
                  t.count > 0 ? "text-fg-strong" : "text-fg-muted"
                }`}
              >
                {t.count}
              </div>
              <div className="mt-1 text-xs text-fg-muted">{t.caption}</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Manage</h2>
        <ul className="mt-2 list-disc pl-6 text-sm">
          <li>
            <Link href="/admin/groups" className="text-accent-text hover:underline">
              M365 groups — flag departments &amp; admin groups, run sync
            </Link>
          </li>
          <li>
            <Link href="/admin/spaces" className="text-accent-text hover:underline">
              Spaces — inventory, re-home or merge orphaned departments
            </Link>
          </li>
          <li>
            <Link
              href="/admin/all-staff-requests"
              className="text-accent-text hover:underline"
            >
              All-staff publish requests
            </Link>
          </li>
          <li>
            <Link
              href="/admin/deletion-requests"
              className="text-accent-text hover:underline"
            >
              Guide deletion requests
            </Link>
          </li>
          <li>
            <Link href="/admin/guides" className="text-accent-text hover:underline">
              All guides — status &amp; audience across every space
            </Link>
          </li>
          <li>
            <Link href="/admin/tags" className="text-accent-text hover:underline">
              Tags — merge duplicates, rename, delete strays
              {(tagCount?.n ?? 0) > 0 && ` — ${tagCount!.n} tag${tagCount!.n === 1 ? "" : "s"}`}
            </Link>
          </li>
          <li>
            <Link href="/admin/settings" className="text-accent-text hover:underline">
              Settings — sign-in page text &amp; account label
            </Link>
          </li>
          <li>
            <Link href="/admin/theme" className="text-accent-text hover:underline">
              Theme — light &amp; dark mode colors
            </Link>
          </li>
          <li>
            <Link href="/admin/mcp" className="text-accent-text hover:underline">
              MCP — connect AI agents, manage clients &amp; grants
              {(mcpClientCount?.n ?? 0) > 0 &&
                ` — ${mcpClientCount!.n} client${mcpClientCount!.n === 1 ? "" : "s"}`}
            </Link>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Recent directory syncs</h2>
        {recentRuns.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">
            No syncs yet. Run one from the Groups page.
          </p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-fg-muted">
              <tr>
                <th className="py-1 pr-4">Started</th>
                <th className="py-1 pr-4">Kind</th>
                <th className="py-1 pr-4">Groups</th>
                <th className="py-1 pr-4">Memberships</th>
                <th className="py-1 pr-4">Result</th>
                <th className="py-1">Notes</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.id} className="border-t border-border">
                  <td className="py-1 pr-4">{run.startedAt.toLocaleString()}</td>
                  <td className="py-1 pr-4">{run.kind}</td>
                  <td className="py-1 pr-4">{run.groupsCount ?? "—"}</td>
                  <td className="py-1 pr-4">{run.membershipsCount ?? "—"}</td>
                  <td className="py-1 pr-4">
                    {run.error ? (
                      <span className="text-danger">{run.error}</span>
                    ) : run.finishedAt ? (
                      <span className="text-success">ok</span>
                    ) : (
                      "running…"
                    )}
                  </td>
                  <td className="py-1 text-fg-muted">{run.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
