# Changelog

All notable changes to Teams KB are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). While the major version is 0, a
minor bump may include changes that need attention when upgrading; those are
listed under **Upgrade notes** in each release.

## [Unreleased]

## [0.3.0] - 2026-09-15

This release is the recommended baseline for new deployments.

### Upgrade notes

- Migrations 0008 through 0011 run automatically during the Vercel build
  (`drizzle-kit migrate`). They add the MCP OAuth tables, the `guides:write`
  scope, the guide `short_id` column with a backfill, and the better-auth
  account schema revert. Run `npx drizzle-kit migrate` yourself if you deploy
  another way.
- Two optional environment variables were added, both with safe defaults:
  `MCP_ALLOW_DYNAMIC_CLIENT_REGISTRATION` (default `true`) and
  `MCP_RESOURCE_URL` (default `${NEXT_PUBLIC_APP_URL}/api/mcp`). See
  `.env.example`.
- AI agents connected over MCP before the `guides:write` scope existed must
  disconnect and reconnect once so the consent screen can grant the new
  permission. Read-only tokens keep working until then.
- The first PDF export per page load downloads the Typst compiler (about
  26 MB) and its fonts (about 9 MB) into the browser; later exports reuse
  them. Printing from the browser is now the suggested route for a paper copy.
- TypeScript 6 and Vitest 5 are now required for local development. Run
  `npm install` after pulling.

### Added

- **MCP server.** Staff can connect an AI agent (Claude, Claude Code, Cursor
  and others) to the knowledge base over the Model Context Protocol. The app
  acts as its own OAuth 2.1 authorization server: the agent sends the person
  through the normal sign-in and a consent page, and every tool call sees
  exactly the guides that person may read. Tools: `list_spaces`,
  `list_guides`, `search_guides`, `get_guide`, and `create_draft`, which turns
  Markdown into an unpublished draft in a department the person belongs to
  (gated by a separate `guides:write` scope and an admin switch that defaults
  to off). Admin → MCP shows readiness checks, connect snippets, a kill
  switch, agent instructions, a result cap, and the connected clients and
  per-person grants with disable and revoke controls. (#5, #7, #8, #9)
- **Permanent guide links.** Every guide has a short link of the form
  `/a/{shortId}` that keeps working when the guide is moved, re-categorized
  or re-slugged. "Copy link" copies it, MCP tools return it as
  `permanentUrl`, and `/a/{shortId}/qr` renders a printable QR label with an
  admin-editable caption (Admin → Settings). (#22)
- **Category pages.** Each category, and each department's General bucket,
  has its own page listing the guides the viewer may see with dates, author
  and a filter box. Space-page cards show the five most recently updated
  guides with a "more…" link, and every guide row carries an audience icon
  (this team, other teams, all staff). Breadcrumbs and sidebar links route
  through the category page. (#15)
- **Edit category page.** Space owners and admins rename, move (admins
  only) and delete a category from one page, reached from a pencil beside
  the category title. Renames keep the web address by default, with an
  explicit choice to change it. Delete is offered only when the category is
  empty. Replaces the admin-only move page. (#20)
- **Collapsible sidebar.** The sidebar can be hidden at any screen width,
  with the choice remembered in a cookie. Keyboard shortcuts: `Cmd/Ctrl+\`
  toggles the sidebar and `/` focuses search. (#16)
- **Theme editor and dark mode.** Admin → Theme lets admins set the palette
  for light and dark modes, with live contrast checks that block saves
  below the body-text minimum; readers get a light/dark toggle in the top
  bar. (#17)
- **Accessible PDF export.** PDF downloads now come from BlockNote's Typst
  exporter, compiled in the browser to a tagged PDF (PDF/UA-1 when the
  document conforms) with selectable text, vector Mermaid diagrams and page
  numbers. Replaces the deprecated react-pdf exporter. (#27)
- **Print a guide.** Printing a guide page hides the app chrome, keeps
  headings with their sections, stops images, tables, code blocks and
  diagrams from splitting across pages, and prints the guide's permanent link
  under the byline. "Print guide" leads the export menu. (#28)
- This CHANGELOG.

### Changed

- The default database handle uses Neon's HTTP driver, one HTTPS request per
  query, and interactive transactions open a short-lived WebSocket client via
  a new `withTransaction` helper. This fixes function crashes when
  better-auth's startup query timed out waiting for a WebSocket during bursts
  of parallel renders. (#14, #18)
- Guide images and videos render without the 1px border and rounded corners,
  so screenshots with their own frame are no longer framed twice. (#29)
- Searching on `/search` is now explicit: a Search button submits, and
  changing the department or tag filters waits for Enter or Search instead of
  re-rendering on every click. (#21)
- TypeScript 6.0, Vitest 5.0, `@types/node` 24, Next 16.3.5, better-auth
  1.7.4, BlockNote 0.54.2, plus Mantine, zod and React type updates. `npm
  audit` reports zero advisories. (#23, #25, #26)

### Fixed

- Pressing Enter in the search box did nothing because the form had two text
  inputs and no submit button. (#21)
- MCP `subscriptions/listen` requests kept a stream open until the Vercel
  function timed out. The server now advertises `tools.listChanged: false`
  and refuses subscriptions, and logs one line per call. (#19)
- MCP client metadata fetches failed on Node 20+ because of a DNS-pinning
  bug in the bundled fetcher; replaced with an equivalent transport that
  prefers IPv4. (#6)
- `create_draft` failed in production: the Markdown parser is now loaded
  outside the route bundle so it gets the full React build, and its jsdom is
  pinned to 26.x because Vercel's runtime disables `require(esm)`. (#10, #11)
- Clients registered before `guides:write` existed could never obtain the
  scope, and the 401 challenge did not advertise it. (#8, #9)
- better-auth 1.7.3 reverted its account schema; migration 0011 follows so
  first sign-ins of new staff members do not fail on a NOT NULL column. (#23)

### Removed

- `@react-pdf/renderer` and the react-pdf based PDF exporter. (#27)

## [0.2.0] - 2026-09-04

### Added

- Move guides between departments and categories, and export a guide as
  PDF, DOCX or Markdown from a new export menu. (#2, #3)
- Admin → Spaces page for merging and deleting spaces. (#3)
- Departments removed in Microsoft 365, or un-marked as departments in
  Admin → Groups, are handled gracefully instead of leaving orphaned
  spaces. (#3)
- Donations section in the README. (#1)

## [0.1.0] - 2026-09-04

Initial public release.

[Unreleased]: https://github.com/CalvaryTechOps/teams-kb/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/CalvaryTechOps/teams-kb/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/CalvaryTechOps/teams-kb/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/CalvaryTechOps/teams-kb/releases/tag/v0.1.0
