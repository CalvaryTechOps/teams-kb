# Plan: Read-only MCP server with staff sign-in and an Admin → MCP page

**Status: implemented on `feat/mcp-server` (2026-09-04), awaiting Chris's
local testing.** Requested 2026-09-04; all open questions below are answered
and reflected in the code.

Implementation notes (where the design landed):

- Auth wiring in `src/lib/auth.ts` (`jwt()`, `mcp()`, `cimd()`); constants in
  `src/lib/mcp/config.ts`; new tables appended to `src/db/auth-schema.ts`
  (migration `drizzle/0008_mcp-oauth.sql`).
- The provider's built-in "resume after login" keeps its state in the
  request, which the SAML round-trip can't carry, so the sign-in card sends
  the user back to `/api/auth/oauth2/authorize` itself after SAML
  (`src/lib/oauth-resume.ts`, unit-tested). Consent page:
  `src/app/connect/consent/`.
- Discovery: route files under `src/app/.well-known/…` forward to the auth
  handler (`src/lib/mcp/discovery.ts`) instead of `next.config` rewrites, so
  the plugins see the original root path; `src/proxy.ts` excludes the prefix.
- Access from a token: `getUserAccessById` in `src/lib/permissions.ts`, built
  on the pure `buildUserAccess` (`src/lib/user-access.ts`).
- Tools/server/route: `src/lib/mcp/{shape,tools,server}.ts`,
  `src/app/api/mcp/route.ts` (`legacy: "stateless"`, `requiredScopes:
  ["guides:read"]` — the first thing to relax if a client fails with
  `insufficient_scope`). Search shared with the page via
  `src/lib/guide-search.ts`.
- Settings: `src/lib/mcp-settings.ts` (+ `.server.ts`); admin page
  `src/app/admin/mcp/`.
- Not yet verified against real clients (needs a browser + SAML): the full
  connect flow, and whether Claude.ai / Claude Code / Cursor request the
  `guides:read` scope. Test plan below is the checklist.

## Goal

Let staff connect their AI agent (Claude.ai, Claude Code, Cursor, …) to the
knowledge base over the Model Context Protocol, so the agent can search and
read guides **on that person's behalf** — never more than they could see in
the browser. Version 1 is read-only, has a handful of tools, and returns
guide metadata plus the raw BlockNote JSON without rendering it. An admin
page named **MCP** shows the URLs staff need, holds the runtime settings, and
lists the agents that have been connected.

Deliberately out of scope for v1 (future versions): write tools (drafting,
suggesting edits), content transformations (Markdown/plain-text projections,
"skills"), a self-service "My connected agents" page, and per-space or
per-tool scopes.

## What exists and matters here

- **Sessions and SSO** are better-auth 1.7 (`src/lib/auth.ts`) with SAML
  sign-in only. There is no password login, so any OAuth flow has to bounce
  through the existing `/sign-in` card (`src/app/sign-in/sign-in-card.tsx`)
  which calls `authClient.signIn.sso({ providerId: "entra", callbackURL })`.
- **Authorization** is `src/lib/permissions.ts`: `getUserAccess()` builds a
  `UserAccess` (member/owner group sets, `isAdmin`) from the *session* and
  the mirrored `m365_group_member` rows; `visibleGuidesWhere(access)` is the
  SQL fragment every list/search query AND-s in; `resolveGuidePermissions`
  is the pure per-guide resolver. MCP must reuse these — it only lacks a
  session cookie, so the user-id → access step needs to be callable from a
  verified token instead.
- **Search** is Postgres FTS over `guide.search_vector` in
  `src/app/(kb)/search/page.tsx`, always AND-ed with the visibility
  fragment. The query is inline in the page today; the MCP tool needs the
  same query, so it moves into a shared module.
- **Guide content** is the BlockNote JSON in `guide_revision.content`
  (validated shape in `src/lib/guide-content.ts`, `content_version` marks
  the generation). Media inside it points at public-but-unguessable Blob
  URLs — fine to hand to an agent as-is.
- **Admin settings** pattern: `app_setting` key/value rows read once per
  request with code defaults (`src/lib/site-settings*.ts`), server actions
  guarded by `requireAdmin()`, admin nav in `src/app/admin/layout.tsx`.
- **Proxy** (`src/proxy.ts`) redirects every non-`/api` path without a
  session cookie to `/sign-in`. OAuth discovery lives under `/.well-known/…`
  at the site root and would be caught by that redirect today.
- **better-auth packages available at the matching 1.7.x line** (verified on
  npm 2026-09-04): `@better-auth/mcp` (OAuth 2.1 authorization server +
  RFC 9728 protected-resource metadata + `requireMcpAuth`),
  `@better-auth/oauth-provider` (what `mcp()` is built on; adds the OAuth
  tables), `@better-auth/cimd` (Client ID Metadata Documents, the MCP
  2026-07-28 client-registration mechanism), and better-auth's built-in
  `jwt` plugin (signing keys + `/jwks`). The MCP protocol itself comes from
  `@modelcontextprotocol/server` v2 (`createMcpHandler`, `McpServer`,
  `registerTool` with zod schemas; `zod` is already a transitive dep and
  becomes a direct one).

## Design

### 1. Authentication: the KB is the OAuth 2.1 authorization server

Staff never paste tokens. Connecting an agent works the way MCP clients
expect (authorization code + PKCE with discovery):

1. Agent calls `POST /api/mcp` without a token → `401` with a
   `WWW-Authenticate` header pointing at the protected-resource metadata.
2. Agent discovers the authorization server (this same app), identifies
   itself (CIMD, or dynamic registration if enabled — see §1b), and opens
   the browser at `/api/auth/oauth2/authorize?…`.
3. No session → better-auth redirects to `/sign-in?<signed oauth query>`.
   The card runs the normal SAML sign-in. With `oauthProviderClient()` added
   to `src/lib/auth-client.ts`, the client attaches the signed query to the
   sign-in request, the provider's *before* hook stores it, and its *after*
   hook resumes authorization the moment the SAML callback sets the session
   cookie. (Verify this end-to-end with SAML during implementation; the
   fallback is passing `callbackURL = /api/auth/oauth2/authorize?<signed
   query>` from the card so the user lands back on the authorize endpoint
   with a fresh session.)
4. Signed in → redirected to the **consent page** `/connect/consent` (new,
   §1c) → approve → redirect back to the agent with a code → token.
5. Access tokens are JWTs signed by the `jwt` plugin, audience-bound to the
   MCP resource URL, ~1 hour; refresh tokens 30 days. `requireMcpAuth`
   verifies signature/issuer/audience/expiry against `/api/auth/jwks` with
   no database round-trip and hands the tool handler `claims.sub` = our
   `user.id`.

Wiring in `src/lib/auth.ts` (order matters: `nextCookies()` stays last):

```ts
plugins: [
  sso({ ... }),                       // unchanged
  jwt(),                              // signing keys, /jwks
  mcp({
    loginPage: "/sign-in",
    consentPage: "/connect/consent",
    resource: MCP_RESOURCE_URL,       // `${appUrl}/api/mcp` unless overridden
    scopes: ["guides:read"],          // single read scope for v1 (see §2)
    allowDynamicClientRegistration: MCP_ALLOW_DCR,
    allowUnauthenticatedClientRegistration: MCP_ALLOW_DCR,
    accessTokenExpiresIn: 60 * 60,
    refreshTokenExpiresIn: 30 * 24 * 60 * 60,
  }),
  cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
  nextCookies(),
],
```

`resource` must be HTTPS except on loopback, so local dev uses
`http://localhost:3000/api/mcp` and every deployment derives it from
`NEXT_PUBLIC_APP_URL`.

**Why not personal access tokens?** They are simpler to build but every
staff member would have to mint and paste a secret, Claude.ai's connector UI
expects OAuth, and revocation/expiry would be ours to invent. The OAuth
route costs a consent page and a few tables and gives standard behaviour in
every client.

#### 1a. Discovery routes and the proxy

better-auth serves metadata under its own base path:
`/api/auth/.well-known/oauth-authorization-server`,
`/api/auth/.well-known/oauth-protected-resource`, `/api/auth/jwks`,
`/api/auth/oauth2/{authorize,token,register,consent,continue,revoke}`.
RFC 9728 clients may also probe the site root, so:

- `next.config.ts`: rewrite `/.well-known/oauth-protected-resource(/:path*)`,
  `/.well-known/oauth-authorization-server(/:path*)` and
  `/.well-known/openid-configuration` to the `/api/auth/.well-known/…`
  equivalents.
- `src/proxy.ts`: add `.well-known` to the negative matcher. The proxy runs
  *before* `next.config` rewrites, so without this the redirect to
  `/sign-in` would break discovery. (Also confirm the `WWW-Authenticate`
  header's `resource_metadata` URL resolves without a cookie.)

`/connect/consent` is reached with a session, so the proxy needs no change
for it.

#### 1b. Client registration

MCP 2026-07-28 identifies clients by **CIMD** (the client id is an HTTPS URL
to a metadata document; the `cimd` plugin fetches, validates and caches it).
Older clients use **dynamic client registration** (RFC 7591), which the
better-auth plugin leaves off unless asked. v1 turns DCR on via env
(`MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION`, default `true`) so whichever
generation of Claude/Cursor staff run can connect; the Admin → MCP page
shows which mechanism each connected client used so we can turn DCR off
once nothing needs it. This is env rather than a DB setting because plugin
options are fixed when `betterAuth()` is constructed and because
registration is an unauthenticated surface (rate-limited by the plugin).

#### 1c. Consent page (`src/app/connect/consent/page.tsx`)

Server component: `requireAccess()`, read `client_id` from the query, load
the client via `auth.api.getOAuthClient({ query: { client_id } })`, render
the client's name/URI, what is being granted in plain words ("Search and
read guides you can already see in the knowledge base"), and Approve /
Deny buttons. A small client component calls
`authClient.oauth2.consent({ accept })` (needs `oauthProviderClient()` in
`auth-client.ts`) and follows the returned `redirect_uri`. Uses the sign-in
page's visual language (BrandMark, card). Unknown or disabled client → a
friendly error, no buttons.

### 2. Resolving permissions from a token

Split `getUserAccess` in `src/lib/permissions.ts`:

- `buildUserAccess(userId, entraObjectId, rows, bootstrapAdminGroupId)` —
  pure; what the loop inside `getUserAccess` does today. Unit-tested.
- `getUserAccess()` — unchanged contract, now `session → buildUserAccess`.
- **New** `getUserAccessById(userId)` — loads `user.entraObjectId` (null →
  no groups, like today) and `getMembershipRows`, returns `UserAccess | null`
  (null when the user row is gone → the MCP layer answers 401).

Every MCP tool builds its access with `getUserAccessById(claims.sub)` once
per request and then uses exactly `visibleGuidesWhere(access)` and
`resolveGuidePermissions` — no new authorization logic. Group freshness:
the browser path refreshes a user's groups on login when stale
(`shouldRefreshGroups`); MCP tokens can outlive that, but the nightly full
sync re-mirrors every flagged group's roster, so removal from a department
propagates within a day (and immediately if an admin runs "Sync now").
Acceptable for v1; noted in the README.

**Published only.** MCP tools add `guide.status = 'published'` on top of the
visibility fragment and always serve the guide's `current_revision_id`.
Owners/authors can see their drafts in the browser, but an agent following
unapproved instructions is exactly what the review queue exists to prevent
(open question 3 if Chris wants drafts for owners later).

**Scope.** One scope, `guides:read`, requested by default and enforced by
`requireMcpAuth({ requiredScopes: ["guides:read"] })`. Some clients request
no scopes at all — if that turns out to block connection in testing, drop
`requiredScopes` (the audience binding and user identity already carry the
authorization) and keep the scope purely descriptive.

### 3. The MCP endpoint and tools (`src/app/api/mcp/route.ts`)

```ts
const handler = createMcpHandler(({ authInfo }) => buildKbServer(authInfo), {
  responseMode: "json",   // no streaming needed for quick tools; SSE otherwise
  legacy: <see open question 1>,
});
export const POST = requireMcpAuth(
  auth,
  async (request, claims) => {
    if (!(await getMcpSettings()).enabled) return jsonRpcError(503, "MCP is turned off");
    return handler.fetch(request, { authInfo: { subject: claims.sub, ... } });
  },
  { resource: MCP_RESOURCE_URL, requiredScopes: ["guides:read"] },
);
```

Only `POST` is exported (GET/DELETE → 405; the 2026 protocol is stateless
per request, so no session store). `export const maxDuration = 30`.

Server construction lives in `src/lib/mcp/server.ts` (pure tool wiring) and
`src/lib/mcp/tools.ts` (queries), so the route file stays thin. Server
`instructions` (what the agent is told about this server) come from the
admin-editable setting `mcp.instructions` (§4).

Tools — four, all read-only, all scoped by `visibleGuidesWhere`:

| Tool | Input | Output (`structuredContent` + the same JSON as text) |
| --- | --- | --- |
| `list_spaces` | — | Departments with ≥1 visible published guide (or the user's own): `{ slug, name, description, guideCount }` |
| `list_guides` | `space` (slug, required), `category?` (slug) | Guide **metadata** rows, newest first, capped at the admin-set limit |
| `search_guides` | `query` (required), `space?`, `tags?[]`, `limit?` | Same FTS as `/search` (moved to `src/lib/guide-search.ts` and shared with the page): metadata rows + `snippet`, ranked |
| `get_guide` | `id` **or** `space` + `slug` | Metadata + `content` (raw BlockNote block array, untouched) + `contentVersion` + `revision { version, publishedAt, authorName }` |

Metadata shape (one type in `src/lib/mcp/shape.ts`, unit-tested):
`{ id, title, slug, url, space: { slug, name }, category: { slug, name } | null,
tags: string[], audience, publishedAt, updatedAt }`. `url` is the absolute
guide page URL so agents can cite it. Not found or not visible → the same
"not found" tool error (never distinguish "exists but hidden"). Inputs are
validated with zod (`limit` clamped to the admin max; `query` ≤ 200 chars).

### 4. Settings: what lives where

Rule (from the request): anything whose leak or misconfiguration could open
unauthenticated access stays in **environment variables**; runtime knobs
that can't widen access are **admin-editable in the database**.

**Environment** (`.env.example`, README table):

| Variable | Purpose |
| --- | --- |
| `MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION` | `true`/`false` (default `true`). Unauthenticated RFC 7591 registration for pre-CIMD clients. |
| `MCP_RESOURCE_URL` | Optional override of the resource identifier; default `${NEXT_PUBLIC_APP_URL}/api/mcp`. Must be HTTPS off-loopback. |

Signing material never leaves the DB/secret pair: the `jwt` plugin stores
its keys in the new `jwks` table encrypted with `BETTER_AUTH_SECRET`, which
also signs the OAuth query round-trip. Token lifetimes are code constants
in v1.

**Database** — new `app_setting` keys with defaults in a new pure module
`src/lib/mcp-settings.ts` (+ `mcp-settings.server.ts` cached reader), same
pattern as site settings but a separate key space so the Settings form is
untouched:

| Key | Default | Meaning |
| --- | --- | --- |
| `mcp.enabled` | `true` | Kill switch checked on every MCP request (auth endpoints stay up; tools answer 503). |
| `mcp.instructions` | short default text | Server `instructions` sent to agents on initialize. ≤ 2000 chars. |
| `mcp.max_results` | `25` | Cap for `list_guides` / `search_guides` (1–100). |

### 5. Admin → MCP page (`src/app/admin/mcp/page.tsx`, nav label "MCP")

Sections, top to bottom:

1. **Status** — enabled badge, and readiness checks rendered from the
   server: resource URL is HTTPS (or loopback), JWKS has a key, DCR on/off
   (from env, read-only with a hint that it's an env var).
2. **Connect** — the URLs staff (and admins helping them) need, each with a
   copy button: MCP endpoint (`https://kb.example.com/api/mcp`), the two
   discovery URLs, and ready-made snippets: Claude Code
   (`claude mcp add --transport http kb <url>`), a generic
   `{ "mcpServers": { … } }` JSON block, and one-line instructions for
   Claude.ai custom connectors. Copy comes from `NEXT_PUBLIC_APP_URL`, so
   staging/production render their own.
3. **Settings** form (server actions in `actions.ts`, `requireAdmin()`):
   Enabled toggle, Instructions textarea, Max results. Same save/reset
   UX as `/admin/settings`.
4. **Connected clients** — one row per `oauth_client`: name, client id
   (truncated, full on hover), how it registered (CIMD URL vs dynamic),
   created, number of staff with a live grant (non-revoked, unexpired
   `oauth_refresh_token`), last token issued. Actions: **Disable/Enable**
   (`oauth_client.disabled`, blocks new tokens) and **Revoke all
   grants** (revoke that client's refresh + access tokens; existing JWTs
   die at their ≤1h expiry, which the confirm text says).
5. **Grants** — per staff member: user, client, granted, expires, last
   refresh; **Revoke** per row. This is the admin's emergency lever until a
   self-service page exists.

Dashboard (`/admin/page.tsx`) "Manage" list gets an MCP entry with the
client count.

### 6. Schema and migrations

- Run `npx @better-auth/cli generate` to emit the plugin tables, then **merge
  by hand** into `src/db/auth-schema.ts` (the file header already documents
  this convention). Expected additions: `jwks`, `oauth_client`,
  `oauth_resource`, `oauth_client_resource`, `oauth_access_token`,
  `oauth_refresh_token`, `oauth_consent`, `oauth_client_assertion` (plus a
  DPoP replay table if the generator adds one). Snake-case column names
  like the rest of the file; user FKs cascade.
- `npx drizzle-kit generate` → `drizzle/0008_mcp-oauth.sql`; `npx
  drizzle-kit migrate` locally. Vercel builds migrate on their own.
- No changes to content tables. MCP settings reuse `app_setting`.

### 7. Docs

README: add MCP to the intro and Roles table ("connect an AI agent"), a
"Connecting an AI agent" section for staff (what happens when they add the
server: sign in with the work account, approve once), the two env vars in
the Configuration table, an "Admin → MCP" settings table, and an
Architecture note (authorization server co-located, tokens audience-bound,
group-freshness caveat). `.env.example` gets the two variables with
comments.

## Steps

1. `npm i @better-auth/mcp @better-auth/oauth-provider @better-auth/cimd
   @modelcontextprotocol/server zod` (pin the better-auth family to one
   version; bump `better-auth` and `@better-auth/sso` to match if needed).
2. Auth wiring (§1) in `src/lib/auth.ts`; `oauthProviderClient()` in
   `src/lib/auth-client.ts`; MCP constants (`MCP_RESOURCE_URL`,
   `MCP_ALLOW_DCR`) in a new `src/lib/mcp/config.ts`.
3. Schema: generate, merge into `auth-schema.ts`, drizzle migration (§6).
4. `next.config.ts` rewrites + `proxy.ts` matcher (§1a).
5. Consent page (§1c) and a smoke test of the full browser flow with the
   MCP Inspector (`npx @modelcontextprotocol/inspector`) against
   `localhost:3000/api/mcp`, including the SAML round-trip.
6. Permissions refactor (§2) with unit tests for `buildUserAccess`.
7. Extract the search query into `src/lib/guide-search.ts`; the search page
   uses it (no behaviour change).
8. `src/lib/mcp-settings.ts` (+ server reader) with unit tests for
   normalize/merge.
9. Tools and server (§3): `src/lib/mcp/{shape,tools,server}.ts`, route
   handler; unit tests for the metadata shape and input clamping.
10. Admin → MCP page, actions, nav link, dashboard entry (§5).
11. README + `.env.example` (§7).
12. Local verification: `npm test`, `npm run lint`, `npx tsc --noEmit`,
    `npm run build`; connect Claude Code (`claude mcp add --transport http`)
    and, if available, Claude.ai as a custom connector against a tunnel or
    staging later. Commit on `feat/mcp-server`.

## Test plan

- **Discovery without a cookie**: `curl` the root and `/api/auth` well-known
  URLs signed-out → JSON, no redirect. `POST /api/mcp` with no token → 401
  with `WWW-Authenticate` naming the resource metadata.
- **Connect as a member**: authorize → SAML → consent → tools respond.
  `list_spaces` omits departments with nothing visible; `search_guides`
  returns exactly the rows `/search` shows for the same query, minus drafts;
  `get_guide` on a draft the user authored → not found; on a
  `groups`-audience guide shared with one of their groups → content.
- **Connect as an audience-only reader** (not a space member): only
  all-staff and shared guides; `list_guides` on that space still lists just
  those.
- **Admin**: sees everything published, including other departments'
  department-only guides; guides awaiting deletion are absent.
- **Kill switch**: turn MCP off in Admin → MCP → tools 503, discovery and
  token refresh still work; turn on → immediate recovery (per-request read).
- **Revocation**: revoke a grant → the agent's next refresh fails; disable a
  client → new authorizations are refused; existing access JWTs stop at
  expiry (≤1h).
- **Group removal**: remove a user from a department in Entra, run "Sync
  now" → their agent stops seeing that department on the next call.
- **Limits**: `limit: 1000` clamps to the admin max; `query` over 200 chars
  is rejected with a tool error, not a 500.
- **Sign-in still works** without OAuth params (no regression in the plain
  `/sign-in?callbackURL=` path); the proxy still redirects unauthenticated
  page visits.
- Unit: `buildUserAccess`, `mcp-settings` normalize/merge, metadata shape
  from a row, search-query builder parity.

## Open questions for Chris

1. **Protocol generation / `legacy` mode.** `@modelcontextprotocol/server` v2
   speaks MCP 2026-07-28 and can `reject` or accept older clients via its
   `legacy` option. Do the clients your staff use (Claude.ai connectors,
   Claude Code, Cursor) already speak 2026-07-28, or should v1 accept legacy
   protocol versions? Recommendation: accept legacy during rollout and
   verify each client in staging; tighten later.
   Answer: let's accept legacy now and verify clients in staging and tighten later if we can.
2. **Dynamic client registration default.** Plan defaults
   `MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION=true` so pre-CIMD clients work.
   OK to leave on until the Admin → MCP client list shows everything
   registering via CIMD?
   Answer: yes, leave that on for now so we can review and determine if we can turn it off.
3. **Drafts for owners/authors.** v1 serves published revisions only, even
   to people who can see drafts in the browser. Keep it that way for now?
   Answer: the MCP should only reply with published content for v1.
4. **Scope naming.** One scope `guides:read` (visible on the consent screen
   and in tokens). Fine, or prefer no custom scope at all in v1?
   Answer: that is fine
5. **Instructions text default.** Proposed default for `mcp.instructions`:
   "This server searches an internal staff knowledge base. Results are
   limited to guides the signed-in person may read. Cite the guide `url`
   when you use its content. Guide `content` is BlockNote JSON." Edit
   freely or keep?
   Answer: keep that default
6. **Admin page URL.** The request names the page `MCP`; the plan uses
   `/admin/mcp` (lower-case path, "MCP" label) to match the other admin
   routes. OK?
   Answer: yes, match other admin routes with lower-case pth
