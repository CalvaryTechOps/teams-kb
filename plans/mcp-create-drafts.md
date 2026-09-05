# Plan: Let agents create draft guides over MCP from Markdown

**Status: implemented on `feat/mcp-create-drafts` (2026-09-05), awaiting
local testing and a PR.** Open questions answered below and reflected in the
code. Parser choice (§3): `@blocknote/server-util` works in the route handler;
it needs the optional `y-prosemirror` + `y-protocols` peers of BlockNote core
installed, nothing in `next.config.ts`. Follow-up (same day): registered
clients carry a snapshot of the server scope list on `oauth_client.scopes`, and
the authorize endpoint validates requests against it — so without a backfill,
existing agents could never obtain `guides:write` (they would get
`invalid_scope`). Migration `drizzle/0009_mcp-write-scope.sql` appends the
scope to existing client rows; people still reconnect once.
Second follow-up (after the first production deploy): reconnecting still showed
a read-only consent screen. Claude.ai takes its scope list from the `scope`
hint in the MCP endpoint's 401 challenge, not from `scopes_supported`; the
hint defaulted to the enforced `requiredScopes` (`guides:read`). The route now
sets `challengeScopes: [guides:read, guides:write]` while still enforcing only
read, so old tokens keep working.

## Goal

Add the first write capability to the MCP server: a `create_draft` tool that
takes a **department, a title and Markdown content** and creates a new guide
in **draft** status, authored by the signed-in person. Staff may only create
drafts in departments they belong to; admins may create drafts in any
department. Drafts created this way go through exactly the same review path
as drafts started in the browser — nothing an agent writes is ever published
or submitted for review by this tool.

Input is Markdown only. No file uploads yet: the tool has no way to send an
image or attachment, and Markdown that references media by URL is handled
the way the editor already handles pasted URLs (see §3).

This plan assumes the request is about the **MCP server** (the browser
already has a full editor for drafts; the "read-only" MCP v1 deliberately
left write tools for later — `plans/completed/mcp-server.md`, Goal). It adds
no browser UI.

Out of scope for this version: editing existing guides or their drafts,
submitting for review / publishing, categories, tags, audience, attachments,
a "my drafts" listing tool, and a Markdown projection of `get_guide` output.

## What exists and matters here

- **Guide creation** is the new-guide branch of `saveGuide` in
  `src/app/(kb)/spaces/actions.ts`: one transaction inserts the `guide` row
  (status `draft` by default, `created_by` = user) and `guide_revision`
  version 1 (status `draft`, `content_version` = `CONTENT_VERSION`), after
  `uniqueGuideSlugIn(db, spaceId, slugify(title))` picks a free slug. Drafts
  never touch `search_text`, `current_revision_id` or `published_at`. The
  MCP tool must produce exactly these rows, so the insert moves into a shared
  helper rather than being copied.
- **Who may author in a space** is `spacePermissions(access, s.groupId)`
  (same file): `resolveGuidePermissions` against a hypothetical published
  department guide. `canEdit` is true for the space group's members and
  owners and for admins — precisely the rule the request asks for. The
  new-guide page (`src/app/(kb)/spaces/[slug]/new/page.tsx`) gates on the
  same thing. Nothing new to invent; reuse it.
- **Content shape** is the BlockNote JSON validated by `parseGuideContent` /
  `parseGuideContentJson` in `src/lib/guide-content.ts`. It strips unknown
  props, drops unsafe link targets (`isSafeHref`) and non-http(s) media URLs
  (`isSafeMediaUrl`), and rejects unknown block types. `isEmptyDocument`
  is the blank check `saveGuide` uses. Whatever Markdown becomes must pass
  through this before it is stored.
- **Markdown ↔ BlockNote** already runs in the browser for exports:
  `src/components/guide-export.tsx` creates a headless `BlockNoteEditor`
  and calls `blocksToMarkdownLossy`. The inverse, `tryParseMarkdownToBlocks`,
  exists on the same editor class (`@blocknote/core` 0.54.0) but needs a DOM
  (it goes Markdown → HTML → blocks through `DOMParser`). BlockNote ships
  `@blocknote/server-util` at the **same 0.54.0** version
  (`ServerBlockNoteEditor`, wraps the conversions in jsdom; deps: jsdom,
  `@blocknote/core`, `@blocknote/react`, yjs, `@tiptap/pm`) for exactly
  this server-side use.
- **MCP plumbing**: `src/app/api/mcp/route.ts` verifies the token
  (`requireMcpAuth`, `requiredScopes: ["guides:read"]`), resolves
  `getUserAccessById`, and hands `buildKbServer(ctx)` a
  `McpToolContext { access, settings, appUrl }`; `authInfo.scopes` carries
  the token's scopes but the context doesn't. Tools live in
  `src/lib/mcp/server.ts` (registration, zod schemas, `ok`/`fail`) and
  `src/lib/mcp/tools.ts` (queries); the guide JSON shape is
  `src/lib/mcp/shape.ts`. All four existing tools are annotated
  `readOnlyHint: true`.
- **Scopes**: `MCP_SCOPE = "guides:read"` (`src/lib/mcp/config.ts`) is the
  one custom scope; the `mcp()` plugin in `src/lib/auth.ts` lists it with
  the OIDC defaults, and the protected-resource metadata advertises it.
  Claude.ai's connector requested `guides:read offline_access` verbatim from
  that metadata, so whatever we advertise is what new connections ask for.
  The consent page (`src/app/connect/consent/page.tsx`, `SCOPE_TEXT`) shows
  one line per scope; the Admin → MCP page and the README both describe the
  server as "read-only".
- **Settings**: `src/lib/mcp-settings.ts` (pure) + `.server.ts` (cached
  reader), admin form on `/admin/mcp`. Adding a key is a defaults entry, a
  `merge` case, a `normalize` field and a form control.
- **No schema change is needed.** Drafts are ordinary `guide` +
  `guide_revision` rows.

## Design

### 1. Shared write helper: `src/lib/guide-writes.ts`

Extract the new-guide transaction out of `saveGuide` into

```ts
export async function createGuideWithFirstRevision(input: {
  spaceId: string;
  title: string;
  content: GuideBlock[];
  authorId: string;
  categoryId?: string | null;
  revisionStatus: "draft" | "pending" | "published";
}): Promise<{ id: string; slug: string; revisionId: string }>
```

It picks the slug with `uniqueGuideSlugIn`, inserts `guide` + revision 1 in
one transaction, and — only when `revisionStatus === "published"` — sets the
guide's `status`, `current_revision_id`, `search_text` and `published_at`
exactly as the action does today. `saveGuide`'s new-guide branch becomes a
call to it (tags and audience stay in the action; behaviour unchanged). The
MCP tool calls it with `revisionStatus: "draft"` and no category. Server-only
module (imports `db`), so it sits beside `moves.ts`, not in `guide-content.ts`.

### 2. Permission rule for the tool

Resolve the space by slug, then require
`resolveGuidePermissions(access, { spaceGroupId, status: "published",
audience: "department" }).canEdit` — the same `spacePermissions` check the
browser uses. Move that small helper from `spaces/actions.ts` into
`src/lib/permissions.ts` as `canAuthorInSpace(access, spaceGroupId)` so both
callers share one name (the action keeps working via the import).

Unknown slug and "not your department" get the **same** error, so an agent
can't probe for departments the person doesn't see: `No department with slug
"x" that you can create drafts in. Call list_spaces to see your departments.`
(`list_spaces` already includes every department the caller is a member or
owner of, even empty ones, so it doubles as the picker.)

The draft is created with `created_by` = the token's user, so the browser's
existing rules apply from the first second: the author and the space owners
(and admins) can see and edit it; other members cannot; `get_guide` over MCP
cannot return it (published only). Owners see it where they see any draft.

### 3. Markdown → guide content: `src/lib/mcp/markdown.ts`

1. **Parse** with `@blocknote/server-util`:
   `ServerBlockNoteEditor.create()` (default schema — do **not** import the
   client `guideSchema`, which pulls the diagram block's DOM renderer) and
   `await editor.tryParseMarkdownToBlocks(markdown)`. This is the same
   conversion the editor runs when a person pastes Markdown, so an agent's
   draft looks like a pasted one. Create the editor once per module (it is
   stateless for this call) and keep the import inside the tool path so the
   page bundles never see jsdom.
2. **Post-process** (pure, unit-tested, in the same module):
   - Fenced ```` ```mermaid ```` blocks arrive as `codeBlock` with language
     `mermaid`; rewrite them to the app's `diagram` block so they render as
     diagrams rather than source.
   - Strip a leading level-1 heading that equals the title (agents tend to
     repeat it; the page renders the title itself, and exports add it back).
3. **Validate** with `parseGuideContentJson(blocks)` — the same gate as the
   browser. Anything it strips (a `javascript:` link, a `data:` image) is
   silently dropped exactly as it would be from the editor. If the result is
   `isEmptyDocument`, fail with `The Markdown produced no content.`

Media by URL: a Markdown image with an `https://` source becomes an `image`
block pointing at that URL, which the editor already permits (embed by URL)
and `isSafeMediaUrl` already polices. Nothing is uploaded to Blob; the
"no file uploads yet" boundary is that the tool accepts no bytes. Raw HTML
in the Markdown is dropped by BlockNote's parser (it is not in the schema).

Limits, enforced in the zod schema before any conversion: `title` trimmed,
1–200 chars; `markdown` 1–256 KiB (`MAX_MARKDOWN_BYTES`; the stored JSON cap
`MAX_CONTENT_BYTES` is 2 MiB and BlockNote JSON is roughly 3–5× the
Markdown). Both are code constants in `src/lib/mcp/config.ts`.

**Bundling check** (first implementation step, before anything else):
confirm `next build` succeeds with `@blocknote/server-util` imported from a
route handler. If jsdom trips the bundler, add
`serverExternalPackages: ["jsdom", "@blocknote/server-util"]` to
`next.config.ts`. If it can't be made to work at all, fall back to a small
remark-based Markdown → `GuideBlock[]` converter (`remark-parse` + `mdast`
walk, ~200 lines, headings/paragraphs/lists/code/quotes/tables/links/inline
styles) — same post-processing and validation, no DOM. Decide once, note it
in this file's status line.

### 4. The tool

Registered in `buildKbServer` (`src/lib/mcp/server.ts`):

| Tool | Input | Output |
| --- | --- | --- |
| `create_draft` | `space` (department slug, required), `title` (required), `markdown` (required) | `{ id, title, slug, status: "draft", space: { slug, name }, url, editUrl, revision: { version: 1 }, blockCount }` |

- `url` is the guide page (`guideUrl` from `shape.ts`); `editUrl` is
  `${url}/edit`. The person can open either — drafts are visible to their
  author.
- Annotations: `readOnlyHint: false, destructiveHint: false,
  idempotentHint: false, openWorldHint: false`. Description says plainly that
  the result is an unpublished draft the person (or a department owner) must
  review and submit/publish in the browser, and that the same title twice
  creates two drafts (slug gets a suffix) — agents should not retry blindly.
- Handler order: settings check (§6) → scope check (§5) → space + permission
  (§2) → Markdown conversion (§3) → `createGuideWithFirstRevision` (§1) →
  `revalidatePath("/")`, `revalidatePath("/spaces/{slug}")`,
  `revalidatePath("/spaces/{slug}/guides/{guideSlug}")` (works from route
  handlers; matches what `saveGuide` invalidates minus the queue, since
  nothing is pending) → `ok(payload)`.
- Failures use `fail(...)` with actionable text; nothing throws to the
  transport except genuine bugs.

Queries go in `src/lib/mcp/tools.ts` next to the read tools
(`createDraft(ctx, input)` returning a discriminated result like
`listGuides` does), so `server.ts` stays declarative.

### 5. Scope: `guides:write`, shown on consent

Add `MCP_WRITE_SCOPE = "guides:write"` in `config.ts`; list it in the `mcp()`
plugin's `scopes` (advertised in protected-resource metadata alongside
`guides:read`); `requiredScopes` on the route stays `["guides:read"]` so
read-only tokens keep working. Put the token's scopes on the tool context
(`McpToolContext.scopes: string[]`, from `authInfo.scopes`, which the route
already builds).

`create_draft` is **always registered** but its handler fails when the token
lacks `guides:write`:
`This connection was approved before draft creation existed. Disconnect and
reconnect the knowledge base in your agent to grant it.` Always-registered
beats conditional registration here because a missing tool gives the person
nothing to act on, while this message does. (Open question 1 covers the
alternative of not adding a scope at all.)

Consent page `SCOPE_TEXT["guides:write"]`: "Create draft guides in
departments you belong to — drafts stay unpublished until someone reviews
them in the knowledge base". The Admin → MCP grants table gains a Scopes
column (already stored on `oauth_refresh_token` / consent rows) so an admin
can see which connections predate the write scope.

Existing connections keep their `guides:read`-only refresh tokens until the
person reconnects; that is the expected, one-time cost and the README says
so.

### 6. Setting: `mcp.drafts_enabled`

A second switch beside the kill switch, in `McpSettings` as
`draftsEnabled: boolean` (key `mcp.drafts_enabled`, default `true`):
merge/normalize cases, a checkbox in the Admin → MCP settings form
("Allow agents to create drafts"), and a check at the top of the tool
handler (`Draft creation over MCP is turned off for this knowledge base.`).
Read tools are unaffected. Also update the default `mcp.instructions` text
to add: "`create_draft` makes an unpublished draft in a department the
person belongs to; it never publishes." (An admin who saved custom
instructions keeps theirs — the default only applies where no row exists.)

### 7. Copy and docs

- Admin → MCP page: replace "… Read-only." in the intro with a sentence that
  agents can also create drafts, never publish.
- README "Connecting an AI agent (MCP)": the bullet "Read-only. Four
  tools…" becomes "Five tools…" naming `create_draft`, stating drafts are
  created in the person's own departments only (any department for admins),
  are unpublished until reviewed, and that connections made before this
  feature need a reconnect to grant the new permission. Settings table gains
  "Allow agents to create drafts — on". Architecture note: one sentence on
  server-side Markdown conversion via `@blocknote/server-util` and
  validation through the same `parseGuideContentJson` as the browser.
- `plans/completed/mcp-server.md` is history; do not edit it.

## Steps

1. `npm i @blocknote/server-util@0.54.0` (pin to the installed BlockNote
   line). Smoke-test the bundling check from §3 with a throwaway import in
   the MCP route; settle §3's parser choice and record it in the status line.
2. `src/lib/guide-writes.ts` (§1); refactor `saveGuide`'s new-guide branch
   onto it. `npm test` + a manual browser check that creating a guide as
   draft and as publish still behaves identically.
3. `canAuthorInSpace` in `src/lib/permissions.ts` (§2); `spaces/actions.ts`
   and `spaces/[slug]/new/page.tsx` use it.
4. `src/lib/mcp/markdown.ts` (§3) with unit tests: headings/lists/code/
   tables/links round-trip into valid `GuideBlock[]`; mermaid fence →
   `diagram`; duplicate title heading stripped; empty and whitespace-only
   input → empty document; `javascript:` link loses its href; oversized
   input rejected before conversion.
5. Config constants (`MCP_WRITE_SCOPE`, `MAX_MARKDOWN_BYTES`,
   `MAX_TITLE_LENGTH`) in `src/lib/mcp/config.ts`; `scopes` on
   `McpToolContext` populated in `route.ts`; `mcp()` plugin scopes in
   `auth.ts` (§5).
6. `createDraft` in `tools.ts` and the `create_draft` registration in
   `server.ts` (§4).
7. Settings (§6): `mcp-settings.ts` + tests, admin form + action, new
   default instructions text.
8. Consent `SCOPE_TEXT`, Admin → MCP copy and Scopes column, README (§5, §7).
9. Local verification: `npm test`, `npm run lint`, `npx tsc --noEmit`,
   `npm run build`; connect Claude Code (`claude mcp add --transport http`)
   to `localhost:3000/api/mcp` and run the test plan. Commit on
   `feat/mcp-create-drafts`.

## Test plan

- **Member of one department**: `create_draft` in that department succeeds;
  the guide appears on the space page for the author (draft badge) and for
  an owner, not for another member; `get_guide` over MCP for it → not found;
  `/spaces/{s}/guides/{slug}/edit` opens the stored blocks in the editor.
  The same call for a department they are not in → the "no department with
  slug … that you can create drafts in" error, identical to a made-up slug.
- **Audience-only reader** (not a member) → same error.
- **Admin** → succeeds in any department; `created_by` is the admin.
- **Content**: a Markdown sample with H1–H3, bold/italic/strikethrough/
  inline code, nested bullet and numbered lists, a task list, a table, a
  fenced code block, a ```` ```mermaid ```` block, a quote, links, and an
  `https://` image renders in the browser as the equivalent BlockNote blocks
  (diagram block for the mermaid fence). A leading `# {title}` line is not
  duplicated. A `[x](javascript:alert(1))` link is plain text. Raw `<script>`
  is gone.
- **Empty**: whitespace-only Markdown → tool error, no rows written.
  Missing `title`/`space`/`markdown` → zod validation error, no rows.
- **Limits**: 300 KiB of Markdown → rejected before conversion; a 201-char
  title → rejected.
- **Duplicate title** twice → two drafts, slugs `x` and `x-2` (`uniqueGuideSlugIn` suffixes -2, -3, …),
  both listed for the author.
- **Scope**: a token minted with only `guides:read` (an existing connection)
  → the reconnect message; after disconnect/reconnect the consent screen
  shows the new line and the tool works. Read tools work in both states.
- **Settings**: turn "Allow agents to create drafts" off → the tool fails
  with the turned-off message, reads still work; on → immediate recovery.
  Global kill switch off → 503 for everything as before.
- **Regression**: browser new-guide as draft and as publish (owner) still
  produce the same rows as before the refactor (compare a before/after
  `guide` + `guide_revision` row pair on the dev branch).
- **Unit**: `markdown.ts` post-processing and conversion cases (step 4),
  `mcp-settings` merge/normalize for the new key, `canAuthorInSpace`.

## Open questions for Chris

1. **New scope or not.** The plan adds `guides:write` so the consent screen
   is honest about what an agent may do, at the cost that every existing
   connection has to be disconnected and reconnected once before
   `create_draft` works (reads keep working). The alternative is no new scope
   — writes gated only by the person's identity — which needs no reconnect
   but leaves the consent text saying "search and read". Recommendation: add
   the scope.
   Answer: add the scope
2. **Optional category / tags on the tool.** The request names department,
   title and content as the required inputs. Should the tool also accept an
   optional `category` slug (from the space's existing categories; `general`
   or omitted → uncategorized) and `tags`? Both are cheap to add now and
   awkward for agents to fix later since there is no edit tool.
   Recommendation: accept an optional `category` only; leave tags for the
   browser.
   Answer: accept an optional `category` only; leave tags for the browser.
3. **Media by URL.** Markdown images with an `https://` source become image
   blocks pointing at the external URL (what the editor already allows).
   Keep that, or strip images entirely until uploads exist?
   Recommendation: keep.
   Answer: Keep meedia URLs as-is
4. **Default for "Allow agents to create drafts".** Plan defaults it **on**
   so the feature works the moment it deploys. Prefer **off** with a manual
   flip in Admin → MCP for a soft launch?
   Answer: default to **off** 
5. **Server name/version.** `SERVER_VERSION` in `server.ts` is `"0.1.0"`;
   bump to `0.2.0` with the first write tool (and the package version with
   the release), or leave versions to the release chore?
   Answer: bump the server version to 0.2.0
