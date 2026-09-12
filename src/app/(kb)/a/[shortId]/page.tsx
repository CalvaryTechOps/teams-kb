import { redirect } from "next/navigation";
import { APP_TITLE } from "@/lib/branding";
import { TopBar } from "@/components/shell/top-bar";
import { PermalinkNotice } from "@/components/permalink-notice";
import { guidePath } from "@/lib/permalink";
import { resolvePermalink } from "@/lib/permalink.server";
import { getSession, requireAccess } from "@/lib/permissions";

// The permanent link behind "Copy link" and printed QR codes: /a/{shortId}
// looks the guide up by its never-changing short id and sends the visitor to
// today's readable URL with a temporary (307) redirect — never permanent, so
// browsers don't cache a target that a later move will change. Signed-out
// visitors never get here: proxy.ts sends them through sign-in with this
// path as the callback. plans/guide-permalinks.md §2.

export default async function PermalinkPage({
  params,
}: PageProps<"/a/[shortId]">) {
  const { shortId } = await params;
  const access = await requireAccess();
  const resolution = await resolvePermalink(shortId, access);
  if (resolution.kind === "ok") redirect(guidePath(resolution.target));

  const session = await getSession();
  return (
    <>
      <TopBar
        crumbs={[
          { label: APP_TITLE, href: "/" },
          {
            label:
              resolution.kind === "forbidden" ? "No access" : "Guide not found",
          },
        ]}
        userName={session?.user.name ?? "Staff"}
      />
      <PermalinkNotice resolution={resolution} />
    </>
  );
}
