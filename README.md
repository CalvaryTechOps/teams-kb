# Teams KB

A staff knowledge base for organizations on Microsoft 365. Each Teams-enabled
group becomes a department with its own space of guides; group members draft,
group owners approve and publish, and an admin group runs the whole thing.
Guides can be shared with specific groups or with everyone who can sign in,
and any guide can be copied as a link or downloaded as PDF, DOCX or Markdown.
Staff can also connect an AI agent over the Model Context Protocol and let it
search and read the guides they can see (read-only).

## Assumptions

This project deliberately targets one stack. Other hosts, databases and
identity providers are not supported yet.

- **Hosting: Vercel.** The build runs database migrations, previews get their
  own database branch, and a Vercel Cron triggers the nightly directory sync.
- **Database: Neon Postgres** through the Neon Vercel integration
  (`DATABASE_URL` pooled for the app, `DATABASE_URL_UNPOOLED` for migrations).
- **Sign-in: Microsoft Entra ID via SAML** (an Enterprise application). There
  is no password login and no other identity provider.
- **Directory: Microsoft Graph.** Groups and memberships are mirrored nightly
  and refreshed on login. **Teams-enabled M365 groups are the departments**:
  an admin flags a group as a department and it gets a space.
- **"All staff" means everyone who can sign in.** The app has no allowlist of
  its own; the population is whoever Entra lets through the SAML application
  (assigned users/groups, or the whole tenant if assignment is not required)
  with an email on `SAML_EMAIL_DOMAIN`. Control it in Entra.
- **Media: Vercel Blob.** Guide images, audio and video upload from the
  browser to a public Blob store (see Known tradeoffs).

Stack: Next.js (App Router) · Tailwind · Drizzle + Neon Postgres · better-auth
(SAML SSO) · Microsoft Graph · BlockNote editor (JSON blocks) · Vercel.

## Donations
Find this project helpful?
Please consider a tax deductible donation to Calvary Tech Ops: https://pushpay.com/g/calvarytechops

## Roles

| Who | Can |
| --- | --- |
| Any signed-in user | Read published guides shared with all staff or with a group they belong to; connect an AI agent that reads the same guides on their behalf |
| Group **member** | Read everything published in their department, draft new guides, suggest edits |
| Group **owner** | Approve and publish in their department, share with other groups, request all-staff publishing and deletion |
| **Admin** (member of an admin-flagged group, or of `KB_BOOTSTRAP_ADMIN_GROUP_ID`) | Everything, plus flag departments/admin groups, approve all-staff and deletion requests, manage tags, edit site text, manage connected AI agents |

## Local development

```bash
cp .env.example .env.local   # fill in values (see Configuration)
npm install
npx drizzle-kit migrate       # apply migrations to your Neon dev branch
npm run dev                   # http://localhost:3000
```

Schema changes: edit `src/db/*-schema.ts`, then `npx drizzle-kit generate`
and `npx drizzle-kit migrate`. Migrations are committed under `drizzle/` and
applied automatically by every Vercel build (`npm run build`).

Tests: `npm test` (Vitest). Lint: `npm run lint`.

## Entra ID setup (one-time, by a tenant admin)

### 1. SAML SSO (Enterprise application)

1. Entra admin center → **Enterprise applications** → New application →
   *Create your own application* (non-gallery) → name it after your deployment.
2. **Single sign-on → SAML**:
   - **Identifier (Entity ID)**: the app URL, e.g. `https://kb.example.com`
     (must equal `NEXT_PUBLIC_APP_URL`).
   - **Reply URL (ACS)**: `https://kb.example.com/api/auth/sso/saml2/sp/acs/entra`
   - **NameID**: `user.userprincipalname` (email format). Default claims are
     fine — Entra automatically emits the `objectidentifier` claim the app
     relies on.
3. Download the **Certificate (Base64)** → `SAML_IDP_CERT`.
   Copy **Login URL** → `SAML_ENTRY_POINT` and **Microsoft Entra Identifier**
   → `SAML_IDP_ENTITY_ID`.
4. **Assign users/groups.** This assignment *is* your "all staff" audience.

### 2. Graph sync (App registration)

1. Entra admin center → **App registrations** → New registration.
2. **API permissions** → Microsoft Graph → *Application* permissions:
   `GroupMember.Read.All`, `User.Read.All` → **Grant admin consent**.
3. **Certificates & secrets** → new client secret → `GRAPH_CLIENT_SECRET`
   (+ `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` from the Overview page — use the
   *Application (client) ID*, not the Object ID).

### 3. First admin

Set `KB_BOOTSTRAP_ADMIN_GROUP_ID` to the object id of an M365 group (for
example your IT team). Its members are always admins. After the first sync,
admins can flag further groups as admin groups in **Admin → Groups**.

## Connecting an AI agent (MCP)

The knowledge base is an MCP server at `https://kb.example.com/api/mcp`
(**Admin → MCP** shows the exact URL and copy-ready snippets). Add it to
Claude.ai (Settings → Connectors → custom connector), Claude Code
(`claude mcp add --transport http kb <url>`), Cursor or any client that
supports remote MCP servers with OAuth. The first call opens the normal
work-account sign-in, then a one-time consent screen; after that the agent
holds a token for that person only.

- **Five tools.** `list_spaces`, `list_guides`, `search_guides` and
  `get_guide` are read-only: they return guide metadata (title, department,
  category, tags, URL) and, for `get_guide`, the raw BlockNote JSON of the
  published revision. Drafts and unpublished work are never returned.
  `create_draft` takes a department, a title and Markdown and creates a new
  guide as an **unpublished draft** authored by that person, in a department
  they belong to (admins: any department). It never publishes or submits for
  review — the draft appears in the browser like any other and follows the
  normal review path. No file uploads; images work by `https` URL only.
  Draft creation is off until an admin turns it on in **Admin → MCP**, and
  agents connected before it existed must be disconnected and reconnected
  once to grant the new permission (the consent screen lists it; a migration
  adds the scope to already-registered clients so the reconnect succeeds).
- **Same permissions as the browser.** Every query is filtered with the
  same visibility rules as the site, resolved from the signed-in person's
  group memberships. Group changes reach agents at the next directory sync
  (nightly, or **Admin → Groups → Sync now**).
- **Admin → MCP** holds the kill switch, the instructions text agents
  receive, the result cap, and the list of connected clients and per-person
  grants with disable/revoke controls.

## Deployment (Vercel + Neon)

1. Create the Vercel project from this repository and add the **Neon**
   integration (it sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, and gives
   each preview deployment its own database branch).
2. Create a **Vercel Blob** store with public access →
   `BLOB_READ_WRITE_TOKEN`.
3. Set every remaining variable from `.env.example` in the Vercel project.
   `CRON_SECRET` guards the daily Graph sync cron declared in `vercel.json`.
4. Deploy. The build runs `drizzle-kit migrate` before `next build`.
5. Sign in with a member of the bootstrap admin group, open **Admin →
   Groups**, run a sync, and flag your departments.

Suggested branch model: feature branches → pull request → `main` (production).
Preview deployments are fully functional against their own database branch,
but SAML needs a Reply URL per hostname, so SSO on previews requires a
second Enterprise application or a fixed staging alias.

## Configuration

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | yes | Public base URL; also the SAML issuer/audience |
| `BETTER_AUTH_SECRET` | yes | Session signing secret (`openssl rand -base64 32`) |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | yes | Neon connection strings (set by the integration) |
| `SAML_ENTRY_POINT`, `SAML_IDP_ENTITY_ID`, `SAML_IDP_CERT` | yes | From the Enterprise application's SAML page |
| `SAML_EMAIL_DOMAIN` | yes | Staff email domain routed to SSO; SSO is disabled until all four SAML values are set |
| `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` | yes | App registration for directory sync |
| `KB_BOOTSTRAP_ADMIN_GROUP_ID` | yes | Group whose members are always admins |
| `BLOB_READ_WRITE_TOKEN` | for uploads | Vercel Blob store token; uploads return 503 until set |
| `CRON_SECRET` | yes | Shared secret for `/api/cron/graph-sync` |
| `MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION` | no | Let MCP clients register themselves (needed by clients that predate Client ID Metadata Documents). Default `true` |
| `MCP_RESOURCE_URL` | no | Resource identifier MCP tokens are bound to. Default `${NEXT_PUBLIC_APP_URL}/api/mcp`; must be HTTPS off localhost |
| `NEXT_PUBLIC_APP_TITLE` | no | Product name in the tab title, breadcrumbs, sign-in page and sidebar wordmark. Default `Knowledge base` |
| `NEXT_PUBLIC_BUILT_BY` | no | Credit line on the sign-in page. Default `Built by Calvary Tech Ops`; set empty to hide |
| `NEXT_PUBLIC_LOGO_URL` | no | Logo for the sidebar and sign-in page (shown on a dark background). Blank renders the app title as text |

`NEXT_PUBLIC_*` values are inlined at build time — redeploy after changing them.

### Admin → Settings (stored in the database)

Admins can edit these without a deploy. Blank means "use the default".

| Setting | Default |
| --- | --- |
| Sign-in tagline | "How-tos, policies and setup guides from every department — written down so you don't have to ask twice." |
| Sign-in help text | "Use your work account — the same account used for other trusted systems." |
| Sign-in button | "Sign In" |
| Redirect note | "Redirects to your work sign-in" |
| Account label (sidebar) | "Work account" |

### Admin → MCP (stored in the database)

| Setting | Default |
| --- | --- |
| Enabled | on — when off, MCP tools answer 503 while sign-in and token refresh keep working |
| Instructions for agents | A short note that results are limited to what the person may read, to cite the guide `url`, that `content` is BlockNote JSON, and that `create_draft` never publishes |
| Max results per call | 25 (1–100) |
| Allow agents to create drafts | off — enables the `create_draft` tool; reading is unaffected |

## Architecture notes

- **Identity bridge**: authorization is always keyed on the user's Entra object
  id (`user.entra_object_id`), never email. It arrives in the SAML
  `objectidentifier` claim and matches Graph's member/owner ids.
- **Permissions** live in `src/lib/permissions.ts` — the only module that
  compares group ids. Every server action checks there first.
- **Directory mirror**: `m365_group` / `m365_group_member` are synced from
  Graph (nightly full sync via cron, per-user refresh on login) and never
  edited by hand except the department/admin flags.
- **Content** is a BlockNote JSON document (`guide_revision.content`, an array
  of blocks; `content_version` marks the schema generation). The accepted
  block shape lives in `src/lib/guide-content.ts`, which validates every
  submission and derives search text and the review queue's line diff;
  `src/components/guide-content.tsx` renders it to HTML on the server (Mermaid
  diagrams render client-side). BlockNote versions are pinned exactly — an
  upgrade means re-running the content tests and bumping `content_version` if
  a renderer needs to know. Every edit is a revision row.
- **Site text** (`app_setting`) is read once per request with defaults from
  `src/lib/site-settings.ts`; a database outage falls back to the defaults so
  the sign-in page always renders.
- **Exports** run in the browser (`src/components/guide-export.tsx`, loaded
  only when a download is chosen): `@blocknote/xl-pdf-exporter` and
  `@blocknote/xl-docx-exporter` with the diagram block's own mappings, and
  BlockNote's lossy Markdown conversion. Media is fetched directly from Blob
  rather than through BlockNote's default CORS proxy. PDFs use the exporter's
  bundled Inter, since react-pdf can't load the site's WOFF2 Metropolis.
- **MCP** (`src/app/api/mcp/route.ts`, `src/lib/mcp/`): the app is both the
  OAuth 2.1 authorization server and the protected resource, via better-auth's
  `@better-auth/mcp` plugin (plus `jwt` for signing keys and `@better-auth/cimd`
  for Client ID Metadata Documents). Access tokens are JWTs audience-bound to
  `MCP_RESOURCE_URL` and verified against `/api/auth/jwks` with no database
  round-trip; the user id in the token is resolved to the same access context
  the browser uses (`getUserAccessById`) and every tool query is AND-ed with
  `visibleGuidesWhere` plus `status = 'published'`. The `create_draft` tool
  converts Markdown with BlockNote's own parser run server-side
  (`@blocknote/server-util`, `src/lib/mcp/markdown.ts`; listed in
  `serverExternalPackages` because bundled into a route handler it would see
  React's server-only build and fail to import), then validates the
  blocks with the same `parseGuideContentJson` gate as the browser and writes
  them through the same helper as the new-guide form (`src/lib/guide-writes.ts`);
  a `guides:write` scope on the token gates it; the endpoint's 401 challenge
  advertises both scopes (`challengeScopes`), which is where MCP clients take
  their scope request from, while only `guides:read` is enforced. Discovery documents at
  `/.well-known/…` are served by route files that forward to the auth handler
  (`src/lib/mcp/discovery.ts`); the proxy excludes that prefix so they work
  without a cookie. Because SAML can't carry the provider's in-request OAuth
  state across the Entra round-trip, the sign-in card sends the user back to
  the authorize endpoint itself (`src/lib/oauth-resume.ts`).
- **Typeface**: Metropolis (public domain, `src/fonts/LICENSE-Metropolis.txt`).

## Known tradeoffs

- Guide media uploads go straight to Vercel Blob as public, unguessable URLs —
  anyone holding a URL can view the file. Upgrade path: serve through an
  auth-checked `/api/files/*` proxy (no schema change).
- Only Teams-enabled groups are synced. If a Team is deleted its space is
  orphaned (readable, not editable) until an admin re-homes it; see
  `plans/completed/handle-orphaned-spaces.md`.
- MCP access tokens live up to an hour and are not checked against the
  database, so revoking a grant or removing someone from a group takes effect
  at the next token refresh (and, for groups, the next directory sync).

## Contributing

Open an issue or pull request. Feature work goes on a branch off `main`; the
`plans/` folder holds design notes for pending and completed work and is a good
place to start a larger change.

## License

GPL-3.0-only. See [LICENSE](LICENSE). Metropolis is released under The
Unlicense (`src/fonts/LICENSE-Metropolis.txt`). The `@blocknote/xl-*` export
packages are dual-licensed `GPL-3.0 OR PROPRIETARY` and are used here under
GPL-3.0, so no commercial BlockNote licence is required.
