# Plan: Vitest 5 and `@types/node` 24

**Status: not started (planned 2026-09-12, deferred from the
dependency-audit-2026-09 plan). No blocker; can start any time.**

## Context

`vitest` is at 4.1.11; 5.0.0 is out. Requirements are met: Node ≥ 22.12
(local 24.15, Vercel project setting 24.x), Vite ≥ 6.4 (8.2.2 in the tree),
peer `@types/node ^22 || >=24`. Ours is `@types/node ^20`, which no longer
matches either runtime, so this plan moves it to `^24` in the same pass.

Vitest 5 changes that touch this repo (from the migration guide, checked
against `src/`):

- `clearMocks` now defaults to `true`: mock call history is cleared before
  each test. 12 assertions use `toHaveBeenCalled`/`mock.calls`; none appear
  to depend on history carried between tests, but the run will tell.
- `vi.mock` must be top-level: our 3 files that use it already are.
- Un-awaited `.resolves`/`.rejects` assertions now fail: none found.
- Generated reports move to `.vitest/`: add it to `.gitignore`.
- `-t` filter separator is now ` > `; `bench` moved off the top-level
  import (unused here); deprecated entry points removed (unused).
- Fake timers now also mock `Temporal`; irrelevant unless a test uses them.
- The Vite config-loader warning printed on every run ("ESM syntax in a
  file loaded as CommonJS (vitest.config.ts)") is fixed by renaming to
  `vitest.config.mts`; the `tsconfig.json` `include` already lists `**/*.mts`.

`@types/node` 24 versus 20: `Buffer` is generic over its `ArrayBufferLike`
(since 22), which can surface where a `Buffer` is passed to a `Uint8Array`
parameter. `src/` has one `Buffer` use (the DOCX zip reader in
`guide-export.test.ts`); typecheck decides.

## Steps

1. Branch `feat/vitest-5`.
2. `git mv vitest.config.ts vitest.config.mts`; `npm test` should run
   without the loader warning (still on 4.x).
3. `npm install -D vitest@^5 @types/node@^24`. `npm ls` clean, `npm audit`
   still 0.
4. `npm test`; fix what `clearMocks: true` breaks by making the affected
   test set up its own expectations, not by turning the option off.
5. Add `/.vitest/` to `.gitignore`.
6. Verification: lint, `tsc --noEmit`, tests (195 expected), `next build`.
7. Commit. No push.

## Open questions

None blocking. If step 4 turns up more than a handful of test edits,
report before continuing so the scope is agreed.
