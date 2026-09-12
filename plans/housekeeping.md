# Plan: Housekeeping

**Status: open, running list (started 2026-09-12). Not a single feature —
items are added as they are noticed and worked off individually. Each item
carries its own status; the file stays in `plans/` for as long as any item
is open.**

## Purpose

Small maintenance items that are not worth a plan of their own: dependency
tree noise, tooling warnings, stale config, dev-environment quirks. Each
item records what was found, why it happens, and the agreed next action so
nobody has to re-investigate. Items that grow into real work get their own
plan file and a pointer here.

Conventions: one `### H<n>` section per item, newest last; keep the
per-item status line current; when an item is closed, leave it in place
with the resolution so the history stays readable. Items are executed
one at a time on a `feat/*` branch, verified locally and committed — no
push, as with any plan.

## Items

### H1. Six "extraneous" wasm packages reported by `npm ls`

**Status: investigated 2026-09-12, no action needed. Re-check after the
next npm upgrade (currently npm 11.12.1).**

`npm ls` prints six packages as `extraneous`:

| Package | Size | Wanted only by (not installed on darwin-arm64) |
| --- | --- | --- |
| `@img/sharp-wasm32` | 8.8 MB | `@img/sharp-freebsd-wasm32`, `@img/sharp-webcontainers-wasm32` |
| `@emnapi/core` | 1.9 MB | `@tailwindcss/oxide-wasm32-wasi`, `@unrs/resolver-binding-wasm32-wasi` |
| `@emnapi/runtime` | 0.5 MB | same, plus `@img/sharp-wasm32` |
| `@emnapi/wasi-threads` | 0.3 MB | `@tailwindcss/oxide-wasm32-wasi` |
| `@napi-rs/wasm-runtime` | 0.8 MB | `@tailwindcss/oxide-wasm32-wasi`, `@unrs/resolver-binding-wasm32-wasi` |
| `@tybys/wasm-util` | 0.9 MB | `@tailwindcss/oxide-wasm32-wasi` |

Cause: sharp, Tailwind's oxide binding and the `unrs-resolver` binding each
publish one optional package per platform, including a `wasm32` build.
npm 11 correctly skips the `wasm32` packages on darwin-arm64 (their
lockfile entries carry `cpu: ["wasm32"]`), but still installs their
*dependencies*, which carry no `cpu`/`os` fields of their own. With their
only dependents absent, `npm ls` flags them extraneous. `npm prune` does
not remove them and `npm install` re-adds them, so this is npm behaviour,
not a lockfile fault. The same thing is reported against Tailwind
(tailwindlabs/tailwindcss#19136) and is a sibling of the long-standing
npm platform-optional-deps bug (npm/cli#4828).

Findings that rule out a repo problem:

- All six entries have been in `package-lock.json` since the initial
  public release (commit `c706ef1`); the Vitest 5 upgrade did not add them.
- Nothing in the app imports them on this platform; the native
  `@img/sharp-darwin-arm64`, `@tailwindcss/oxide-darwin-arm64` and
  `@unrs/resolver-binding-darwin-arm64` packages are the ones in use.
- `npm audit` is at 0 vulnerabilities including these packages.
- Cost is ~13 MB of local `node_modules` and a few seconds of install time
  on Vercel. Next's output tracing does not bundle them into functions.

Next action: none. Filter them out of the eye when reading `npm ls`
(`npm ls 2>&1 | grep -v extraneous`). Re-check with `npm ls` after the
next npm or Node upgrade; close this item once the output is clean. Do
not add `overrides` or delete lockfile entries to silence it — both hide
real drift and npm regenerates the entries anyway.
