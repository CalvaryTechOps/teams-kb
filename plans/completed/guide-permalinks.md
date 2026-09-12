# Plan: Permanent short links (`/a/{shortId}`) and printable QR codes for guides

**Status: complete — implemented on `feat/guide-permalinks` (2026-09-12),
tested by Chris locally and on staging; awaiting the PR to `main`.**
Open questions below are answered. Verified before the commit: lint, typecheck, 195 unit tests and `next build` pass; the
backfill migration ran against the `development` Neon branch (7 guides, all
ids distinct and well-formed). Signed-in UI paths need SAML SSO and were not
clicked through. Notes from implementation, where the code differs from the
design below:

- **Q3 changed the redirect page.** `classifyPermalink`
  (`src/lib/permalink.ts`, pure, tested) yields `ok` / `not_found` /
  `forbidden`. A published guide the visitor may not read gets "You don't
  have access to this guide — contact {department}"; a missing, deleted or
  unpublished-and-not-visible guide gets "Guide not found". Both pages
  (`/a/{id}` and `/a/{id}/qr`) share `resolvePermalink`
  (`permalink.server.ts`) and `PermalinkNotice`.
- **Q4 added a site setting.** `qr.caption` (Admin → Settings, default
  "Scan to open this guide") is printed under the code; blank means the
  default, like every other setting.
- **Download is the bare QR as SVG**, not the whole label: the code alone
  is what drops cleanly into Word, Canva or a label-printer template, and
  laying the text out in SVG bought nothing over printing the page.
- The MCP default instructions now mention `permanentUrl`; agents still
  cite `url`.
- The "10 000 distinct ids" test in step 2 was wrong by the birthday
  bound (≈3.5 collisions expected); it asserts ≤ 25 collisions instead.
- `APP_URL` joined `src/lib/branding.ts` as the one server-side reading
  of `NEXT_PUBLIC_APP_URL` for these pages.

## Problem

A guide's only address is its readable URL,
`/spaces/{spaceSlug}/guides/{guideSlug}`. Every part of that path can
change after the fact:

- **Moving** a guide to another department rewrites `space_id` and, on a
  collision, the guide slug (`moveGuideInTx`, `src/lib/moves.ts`). Moving or
  merging a whole category does the same to every guide in it.
- **Renaming** a department in Entra changes the space slug on the next sync.
- A future "rename guide with new slug" (the edit-categories plan added the
  equivalent for categories) would change the guide slug directly.

Each of those breaks every bookmark, Teams message, ticket note and MCP
citation that carried the old URL. The category-pages plan papered over the
category case with an inline "not found, update your bookmarks" notice; it
can't do better because the old URL carries nothing stable.

The second cost is physical: staff want to tape QR codes to equipment and
rooms (the copier, the AV rack, the kitchen dishwasher) so anyone can scan
and land on the matching guide from their phone. A QR code is printed once
and can't follow a move, and the readable URL is 60–90 characters, which
makes a denser, harder-to-scan code than necessary.

What exists and matters here:

- **Guide identity.** `guide.id` is a random UUID (`src/db/content-schema.ts`).
  It is already stable across moves — revisions, tags, audience rows and
  requests all key on it — but a 36-character UUID is a poor thing to print
  or read aloud. `guide_space_slug_idx` makes `(space_id, slug)` unique.
- **Creation** has one entry point, `createGuideWithFirstRevision`
  (`src/lib/guide-writes.ts`), shared by the new-guide form and the MCP
  `create_draft` tool. Slug uniqueness is a pre-check loop
  (`uniqueGuideSlugIn`) before the write transaction, not a retry on
  conflict.
- **Permissions.** `resolveGuidePermissions` (`src/lib/guide-permissions.ts`)
  is the pure answer for one guide; `visibleGuidesWhere(access)`
  (`src/lib/permissions.ts`) is its SQL mirror used by every list and by the
  MCP tools. `requireAccess()` sends signed-out users to `/sign-in`, and
  `src/proxy.ts` already redirects signed-out visitors to
  `/sign-in?callbackURL={path}` for every page path that isn't `api`,
  `.well-known`, `sign-in` or a static asset — so a short link opened while
  signed out round-trips through SSO and comes back to the same short path.
- **Copy link** lives in the `GuideActions` split button
  (`src/components/guide-actions.tsx`): it copies
  `new URL(path, window.location.origin)` where `path` is the canonical
  readable path passed from the guide page. Tests in
  `guide-actions.test.tsx` (vitest + happy-dom) pin what it copies.
- **Absolute URLs** server-side come from `NEXT_PUBLIC_APP_URL` (default
  `http://localhost:3000`), read in `src/lib/mcp/config.ts`, `auth.ts` and
  the MCP route. The MCP `GuideMetadata.url` (`src/lib/mcp/shape.ts`,
  `guideUrl()`) is what agents are told to cite.
- **Route groups.** App pages live under `src/app/(kb)/` whose layout
  renders the sidebar shell and calls `requireAccess()`. The root layout
  (`src/app/layout.tsx`) supplies the font, theme CSS and `ThemeProvider`;
  every route is dynamic.
- **Migrations** are drizzle-kit SQL files in `drizzle/` (latest `0009`),
  hand-edited when they need data steps (`0009_mcp-write-scope.sql` is a
  pure backfill). Every Vercel build runs `drizzle-kit migrate`, including
  preview branches with their own Neon DB.
- **Icons** are hand-drawn stroke SVGs in `src/components/icons.tsx`; there
  is no QR icon.
- **Repo is public**: no real hostnames in fixtures — tests use
  `kb.example.com`.

## Design

### 1. The short id

Add `short_id text NOT NULL` to `guide` with a unique index
`guide_short_id_idx`. It is assigned once at creation and never changes:
not on move, rename, re-slug, publish, or archive. It is deliberately a
separate column rather than a prefix of `guide.id`, so its length and
alphabet are ours to choose and a hand-assigned "vanity" id is possible
later without touching the primary key.

A pure module `src/lib/short-id.ts` (no server imports, unit-testable):

```ts
/** Digits 2–9 and consonants except l: nothing that reads as another
 *  character on a scuffed label (0/o, 1/l/i, 5/s), and no vowels so a
 *  random id can't spell a word. 27 symbols. */
export const SHORT_ID_ALPHABET = "23456789bcdfghjkmnpqrstvwxz";
export const SHORT_ID_LENGTH = 5;            // 27^5 ≈ 14.3 million ids

export function generateShortId(random = crypto.getRandomValues): string
/** Lowercase + trim what arrived in the URL; null if it can't be an id
 *  (wrong characters or absurd length). Loose on length so a future
 *  change of SHORT_ID_LENGTH keeps old ids resolvable. */
export function normalizeShortId(input: string): string | null
export function permalinkPath(shortId: string): string   // "/a/{id}"
export function permalinkUrl(appUrl: string, shortId: string): string
```

Case-insensitive on input: labels get read aloud and typed, and iOS
autocapitalises. Storage is always lowercase.

Length is 5 by default (Q1). Four characters as in the request (`/a/37ag`)
gives 27^4 ≈ 531 k ids — plenty for uniqueness, but a random four-character
string collides with an existing guide more often as the KB grows, and a
collision costs a retry, not correctness. Five is still short enough to
print under a QR code in a readable size. Guessability is not a security
property here: every short link is permission-checked exactly like the
readable URL, so a guessed id reveals nothing the guesser couldn't already
list.

**Creation.** `createGuideWithFirstRevision` picks the short id the same
way it picks the slug: generate, pre-check `SELECT 1 FROM guide WHERE
short_id = $1`, regenerate on a hit (bounded, e.g. 5 attempts, then throw),
all before `withTransaction`. A concurrent insert of the same id in the
microseconds between check and commit fails the transaction on the unique
index — the odds are ~n / 14 M per create, and the user just retries.
Return `shortId` alongside `id` and `slug` so the MCP `create_draft` result
can include the permalink.

**Migration** `drizzle/0010_guide-short-id.sql`: run `npx drizzle-kit
generate --name guide-short-id`, then hand-edit the emitted SQL (drizzle
writes `ADD COLUMN … NOT NULL`, which fails on existing rows) into four
statements separated by `--> statement-breakpoint`:

1. `ALTER TABLE "guide" ADD COLUMN "short_id" text;`
2. A `DO $$ … $$` plpgsql block that loops over `guide WHERE short_id IS
   NULL`, builds a candidate with
   `string_agg(substr(alphabet, 1 + floor(random() * 27)::int, 1), '')
   FROM generate_series(1, 5)`, re-rolls while `EXISTS (… short_id =
   candidate)`, and updates that row. Same alphabet and length as the TS
   module, stated in a comment as the one place they are duplicated. A raw
   `UPDATE` does not touch `updated_at` (`$onUpdate` is app-level), so the
   backfill doesn't make every guide look freshly edited.
3. `ALTER TABLE "guide" ALTER COLUMN "short_id" SET NOT NULL;`
4. `CREATE UNIQUE INDEX "guide_short_id_idx" ON "guide" ("short_id");`

The snapshot drizzle generated already describes the final state (not
null + unique index), so later `generate` runs see no drift. Verify on the
`development` Neon branch: zero nulls, `count(distinct short_id) =
count(*)`, every value matches `^[23456789bcdfghjkmnpqrstvwxz]{5}$`.

### 2. The redirect route: `/a/{shortId}`

`src/app/(kb)/a/[shortId]/page.tsx` — a server component, inside the
`(kb)` group so the not-found state has the normal shell.

```
access  = await requireAccess()
id      = normalizeShortId(params.shortId)      → null: notice
row     = select space.slug, guide.slug
          from guide join space on space.id = guide.space_id
          where guide.short_id = id and visibleGuidesWhere(access)
          limit 1
row     ? redirect(`/spaces/${row.spaceSlug}/guides/${row.guideSlug}`)
        : notice
```

- **`visibleGuidesWhere`** is used rather than a second copy of the guide
  page's permission query. It is already the SQL mirror of
  `resolveGuidePermissions` (owners see everything in their space, members
  see published plus their own unpublished, everyone else only published
  guides whose audience reaches them, deleted never), so the short link
  admits exactly the people the destination page would let in. The
  destination page re-checks anyway; this query only decides between
  redirect and notice.
- **Redirect status** is Next's default `307` (temporary). Never `301`/`308`:
  browsers cache permanent redirects, and the whole point is that the
  target may change later. `redirect()` from `next/navigation` gives 307.
- **Query strings are not forwarded** (`?rev=draft` etc.). The permalink
  means "the guide", and a shared/printed link should land on the
  published view.
- **Notice** (guide missing, deleted, or not visible to this user — one
  message for all three, Q3): rendered inline like the category-not-found
  state, with `TopBar` crumbs `[App, "Link not found"]`, heading **This
  link doesn't go anywhere you can see**, body "The guide may have been
  removed, or it may belong to a department you're not a member of. If
  this came from a QR code or a colleague, ask the department that owns
  it.", and a `ButtonLink` "Go to home". No title, department or existence
  hint is disclosed. Rendered inline with a 200 rather than via
  `notFound()`: `notFound()` can't carry the custom copy, and a segment
  `not-found.tsx` can't read params. Same trade the category page made.
- Signed-out arrivals never reach this code: `proxy.ts` sends them to
  `/sign-in?callbackURL=/a/{id}` and SSO brings them back here.

### 3. Where the permalink shows up

**Copy link copies the permalink (Q2).** `GuideActions` gains a
`permalinkPath` prop (`/a/{shortId}`) and "Copy link" copies
`new URL(permalinkPath, window.location.origin)`. The readable URL stays
in the address bar and in the breadcrumb, so nobody loses the ability to
see where a guide lives; what people *share* is the one that keeps
working. The existing `path` prop stays for the QR/edit/move hrefs and the
clipboard-fallback field shows the permalink.

**"About this guide" aside** (desktop only today) gets a **Permanent link**
row: the full short URL as text, and a "Print QR code" link to §4. Both
are useful for unpublished guides too (the id exists from creation), so
they are not gated on status.

**Menu item** "QR code" in the `GuideActions` dropdown, between the
downloads and the Edit/Move separator, linking to the QR page (§4) so it
is reachable on phones where the aside is hidden. New `QrCodeIcon` in
`icons.tsx` (four-square Lucide-style outline).

**MCP** (`src/lib/mcp/shape.ts`): add `permanentUrl` to `GuideMetadata`
next to `url` (Q5), built with `permalinkUrl(appUrl, shortId)`; add
`shortId` to `GuideMetadataRow`/`metadataSelect`. `url` stays the readable
one agents already cite. The `create_draft` result gets `permanentUrl`
too. The default agent instructions in `src/lib/mcp-settings.ts` say
"Cite the guide `url`"; that stays true under the planned Q5 answer, so
the text is untouched.

### 4. Printable QR labels: `/a/{shortId}/qr`

`src/app/(print)/a/[shortId]/qr/page.tsx` in a new `(print)` route group
whose layout (`src/app/(print)/layout.tsx`) does only `requireAccess()` and
renders children on a plain page background — no sidebar, no top bar, so
printing needs no shell-hiding hacks and the guide pages' own print output
is untouched. The URL is keyed by the short id so the "print this label"
link is itself permanent. Next allows `(kb)/a/[shortId]` and
`(print)/a/[shortId]/qr` side by side because they resolve to different
URLs.

Lookup: same query as §2 (`visibleGuidesWhere`), also selecting
`guide.title` and `space.name`. Not visible → same notice text as §2,
rendered in the plain layout. Anyone who can read a guide can print its
label.

**QR generation** happens on the server with `qrcode` (node-qrcode, MIT,
CJS — no ESM `require` pitfalls on Vercel; see memory note on
`require(esm)`): `QRCode.toString(url, { type: "svg",
errorCorrectionLevel: "Q", margin: 0 })` → inline `<svg>`. Level Q (25 %
recovery) because these labels live on equipment and get scuffed; with a
~35-character URL the code is still only 29×29 modules. The encoded text is
the exact `permalinkUrl(NEXT_PUBLIC_APP_URL, shortId)` in byte mode. (An
all-uppercase URL would let the QR use its denser alphanumeric mode, but
Next routes are case-sensitive and `/A/…` would 404; not worth a rewrite
rule.)

**Label** (one component, `src/components/qr-label.tsx`, server-renderable):
QR on top; guide title (bold, 2-line clamp); department name; the short URL
in monospace under the code so a failed scan can be typed; `APP_TITLE`
small at the bottom. Black on white regardless of theme — it's ink. Three
sizes via `?size=sm|md|lg` (label widths ≈ 1.5 in / 2.5 in / 4 in via CSS
`in` units; default `md`), chosen with three plain links (no client state).

**Screen chrome**, all `print:hidden`: a heading "QR label for {title}",
the size links, a **Print** button (client component `print-button.tsx`,
`window.print()`), a **Download SVG** link (`<a download="{slug}-qr.svg"
href="data:image/svg+xml;utf8,…">` — the label SVG for use in Word,
Canva or a label printer; PNG needs canvas and is skipped), and "Back to
guide". `@page { margin: 0.5in }` and the label centred on the sheet when
printed.

### 5. Out of scope (deliberately)

- Vanity/custom short ids and editing a short id (schema allows it later).
- Redirecting *old readable URLs* after a move (would need a slug-history
  table; the permalink is the answer to that problem instead).
- A sheet of many labels / bulk QR export for a whole space.
- PNG download (no canvas on the server; SVG covers Word/Canva/printers).
- Short links for categories or spaces.
- Scan analytics.
- Case-insensitive route matching for `/A/…`.

## Steps

1. `npm i -E qrcode@1.5.4 && npm i -D @types/qrcode`.
2. `src/lib/short-id.ts` (§1) + `short-id.test.ts`: length and alphabet of
   generated ids, 10 000 generations are distinct, `normalizeShortId`
   lowercases/trims and rejects `1`, `l`, `o`, spaces, empty and 40-char
   input, `permalinkPath`/`permalinkUrl` (trailing-slash base handled like
   `guideUrl`).
3. Schema: `shortId: text("short_id").notNull()` and
   `uniqueIndex("guide_short_id_idx").on(t.shortId)` in
   `content-schema.ts`. `npx drizzle-kit generate --name guide-short-id`,
   hand-edit the SQL per §1, `npx drizzle-kit migrate` against the
   development branch, run the verification queries.
4. `createGuideWithFirstRevision`: pick + pre-check the short id before the
   transaction, insert it, return it. MCP `create_draft` result and
   `GuideMetadata` gain `permanentUrl` (§3); update `shape.test.ts` with a
   made-up id (there are no create-draft tests to touch).
5. `src/app/(kb)/a/[shortId]/page.tsx` (§2).
6. `QrCodeIcon`; `GuideActions` `permalinkPath` + `qrHref` props, Copy link
   copies the permalink, QR menu item; guide page passes both and adds the
   aside row. Update `guide-actions.test.tsx` (copy expectation → permalink;
   QR item present and points at `qrHref`).
7. `(print)` layout, `qr-label.tsx`, `print-button.tsx`, the QR page (§4).
   `qr-label.test.tsx`: renders an `<svg>`, the title, the department and
   the short URL text; `size` falls back to `md` on junk.
8. README: feature list (permanent links, QR labels), Architecture note
   ("Permalinks: `guide.short_id`…"), Known tradeoffs (a permalink to a
   guide you can't see shows one generic notice by design).
9. `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`. Update
   this file's status line and commit on `feat/guide-permalinks`. Chris
   tests locally and decides about staging/PR.

## Test plan

- Fresh DB branch: migration runs; every existing guide has a 5-char
  lowercase id from the alphabet; unique; `updated_at` unchanged.
- Create a guide from the form and one via MCP `create_draft`; both get ids;
  `create_draft` returns `permanentUrl`.
- `/a/{id}` as: admin → 307 to the readable URL; space member → same;
  all-staff reader on a department-only guide → notice; anyone on a
  `deleted` guide → notice; garbage id (`/a/1lo`, `/a/x`,
  `/a/` + 40 chars) → notice, no query error; uppercase id → redirects.
- Signed out: `/a/{id}` → sign-in → SSO → lands on the guide.
- Move the guide to another department, then follow the same `/a/{id}`:
  lands on the new URL. Rename its category: still lands.
- Copy link on a guide page (published and `?rev=draft` preview) puts
  `https://{host}/a/{id}` on the clipboard; fallback field shows the same.
- QR page: label renders at three sizes; Print preview shows only the label;
  Download SVG opens in a browser and imports into Word; scanning the
  printed `md` label with an iPhone and an Android phone opens the guide
  (signed in) or sign-in then the guide (signed out); the `sm` label still
  scans from ~30 cm.
- Guide the viewer cannot read: `/a/{id}/qr` shows the notice, not the title.
- MCP `list_guides`/`get_guide` responses carry `permanentUrl`; `url`
  unchanged.
- Existing tests, lint, typecheck and build pass.

## Open questions for Chris

1. **Id length.** Planned: 5 characters from `23456789bcdfghjkmnpqrstvwxz`
   (no vowels, no 0/1/l/i/o/s look-alikes) — about 14 million ids, e.g.
   `/a/7kq4x`. The request's example is 4 (`/a/37ag`, ~531 k ids with this
   alphabet). Go with 5, or 4?
   Answer: Go with your planned 5
2. **What "Copy link" copies.** Planned: the permalink, always. Alternative:
   keep copying the readable URL and add a separate "Copy permanent link"
   menu item.
   Answer: "Copy link" copies the permalink
3. **One notice or two.** Planned: a single "doesn't go anywhere you can
   see" message whether the guide is missing, deleted or just not visible
   to this person, so a link never confirms a guide exists. Alternative:
   tell visible-but-forbidden users which department to ask (leaks the
   department name).
   Answer: Only staff can log in to this tool, so leaking the department is good.  Please provide an error message that reveals if the guide is not found (draft/unpublished messages should be considered "not found"), or if they don't have permission they should be told to contact `department-name` to request access.  
4. **Label contents and sizes.** Planned: QR + title + department + short
   URL + app title, in 1.5 / 2.5 / 4 inch widths. Anything to add (a
   "Scan for the guide" caption, the logo from `NEXT_PUBLIC_LOGO_URL`) or
   drop?
   Answer: Add a nullable config variable to the admin settings page for the text below QR codes (in case different companies have different terminology for these guides)
5. **MCP field.** Planned: add `permanentUrl` next to the existing `url`
   (agents keep citing the readable URL). Alternative: make `url` the
   permalink and add `readableUrl`, so citations stop breaking on moves.
   Answer: add `permanentUrl` next to the existing `url` in case the person references their chat in the future.
