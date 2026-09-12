# Plan: React 19.3

**Status: not started (planned 2026-09-12, deferred from the
dependency-audit-2026-09 plan). No blocker.**

## Context

`react` and `react-dom` are pinned exactly at 19.2.8. React 19.3.0 shipped
2026-09-09 with `<ViewTransition>` and `addTransitionType`, refs on
`<Fragment>`, `browser()` and `onBrowserBailout` in react-dom, independent
transition rendering, Trusted Types support and Fast Refresh fixes. No
breaking changes or deprecations are listed. `@types/react` and
`@types/react-dom` already moved to 19.3.0 in the dependency-audit plan
and typecheck clean against 19.2.8.

Peer ranges all admit it: Next 16.3.5 (`^19.0.0`), `@react-pdf/reconciler`
(`^19.0.0`), BlockNote, Mantine and tiptap (all deduped to whatever `react`
resolves). The reason it was held back was caution, not incompatibility:
Next 16.3.x was released and tested against 19.2, and React minors have
occasionally changed hydration or scheduling behaviour that a framework
patch then follows.

## Design

Bump when either (a) a Next release lists React 19.3 as its tested
version (16.4 canaries already peer on `^19`), or (b) a week or two of
19.3.x patches have landed without a hydration-related fix. Then keep the
exact-pin convention.

## Steps

1. Branch `feat/react-19-3`.
2. Set `react` and `react-dom` to the chosen `19.3.x` in `package.json`;
   `npm install`; `npm ls react react-dom` shows one deduped copy.
3. Verification: lint, typecheck, tests (`happy-dom` renders with the new
   react-dom), `next build`.
4. Manual, local: sign in; open a guide; open the editor, type, add a
   table and a diagram, save; open the search page and a category page;
   toggle the theme; export DOCX. These cover BlockNote/tiptap, Mantine
   and the app's own client components under the new reconciler.
5. Commit. No push.

## Open questions

None.
