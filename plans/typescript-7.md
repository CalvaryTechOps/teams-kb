# Plan: TypeScript 7

**Status: blocked (planned 2026-09-12, deferred from the
dependency-audit-2026-09 plan). Requires `plans/typescript-6.md` first and
waits on typescript-eslint — see "Entry condition".**

## Context

TypeScript 7.0 (released 2026-07-08, latest 7.0.2) is the native Go port:
~10× faster type checking, the `typescript` npm package now ships a
platform binary as `tsc` and **no JavaScript compiler API** ("We expect
TypeScript 7.1 to ship a new (and different) API"). Everything that
consumed the old API is affected:

- **typescript-eslint** (via `eslint-config-next`) peers on
  `typescript >=4.8.4 <6.1.0`. Installing 7 fails peer resolution, and
  even forced, the parser has no API to call. This is the blocker.
- **Next.js build type-check**: fine. Next 16.3 runs the project-local
  `tsc` CLI by default (`experimental.useTypeScriptCli`), explicitly to
  support TypeScript 7; diagnostics lose Next's code frames, nothing else.
- **Editors**: VS Code needs the native TypeScript support (bundled in
  recent releases or the "TypeScript Native Preview" extension).
- **vitest** strips types with its own transformer; unaffected.

Microsoft's documented interim is running 6 and 7 side by side
(`typescript@npm:@typescript/typescript6` for API consumers, the native
package for `tsc`). For a one-package project that adds more moving parts
than it saves; the clean path is to wait until typescript-eslint supports
7 (on the 7.1 API) and then bump once.

Breaking changes in 7 beyond what 6.0 already enforced (see
`plans/typescript-6.md`): template-literal types split strings by code
point, not UTF-16 unit (no such types in `src/`); JavaScript files lose
Closure-style JSDoc and value-as-type shortcuts (`allowJs` is on but the
only JS files are config, which Next reads without type checking).

## Entry condition

```sh
npm view typescript-eslint peerDependencies.typescript   # must admit 7.x
```

and `plans/typescript-6.md` is complete and merged.

## Steps

1. Branch `feat/typescript-7`. Re-run the entry check; record the version.
2. `npm install -D typescript@^7` (plus the typescript-eslint /
   `eslint-config-next` versions that admit it). `npm ls` clean.
3. `npx tsc --noEmit` (now the native binary; first run compiles nothing
   ahead of time, so note the time for the record). Fix any errors in
   code.
4. `npm run lint`, `npm test`, `npm run build`. Confirm the build's
   type-check step ran the CLI and did not exit early.
5. Editor check in VS Code: native TypeScript active for the workspace,
   IntelliSense and go-to-definition working in a route file.
6. Commit. No push.

## Open questions

1. If typescript-eslint takes long to support 7, is the side-by-side alias
   worth doing for the speed alone? Recommended: no, `tsc --noEmit` on
   this codebase already runs in seconds.
