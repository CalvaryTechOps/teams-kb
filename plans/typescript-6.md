# Plan: TypeScript 6.0

**Status: implemented on `feat/typescript-6` (2026-09-12), awaiting local
testing and a push. Typecheck, lint, tests and `next build` all pass on
6.0.3; no code changes were needed and Next did not rewrite
`tsconfig.json`. Editor pick-up of the workspace TypeScript version is the
one step still to confirm by hand. Do this before `plans/typescript-7.md`.**

## Context

`typescript` is at 5.9.3. TypeScript 6.0 (latest 6.0.3) is the last
JavaScript-based release and the stepping stone Microsoft recommends before
7.0: it turns the options 7.0 removes into deprecation errors and flips
several defaults. It keeps the JavaScript compiler API, so
`typescript-eslint` (peer `>=4.8.4 <6.1.0`) and editors keep working.
Next 16.3 type-checks by running the project-local `tsc` CLI
(`experimental.useTypeScriptCli`, on by default), which its docs say
supports TypeScript 6.

Our `tsconfig.json` against the 6.0 changes:

| 6.0 change | Effect here |
| --- | --- |
| `strict` defaults to true | already `true` |
| `module` defaults to `esnext` | already `esnext` |
| `moduleResolution` `node`/`classic` removed | we use `bundler` ✓ |
| `baseUrl` removed | not used; `paths` is relative already ✓ |
| `target` default = current ES year; ES5 removed | `ES2017` stays valid; Next may rewrite it |
| `types` defaults to `[]` | **needs `"types": ["node"]`**: `process.env`, `Buffer`, `node:` imports rely on `@types/node` being auto-included today |
| `rootDir` defaults to `.` | `noEmit`, no effect |
| `esModuleInterop`/`allowSyntheticDefaultImports` can't be false | ours is `true` |
| Import `asserts` removed | not used |
| Less context-sensitive function inference | may reveal new errors; typecheck decides |
| `tsc foo.ts` with a tsconfig present errors | no scripts do that |

`ignoreDeprecations: "6.0"` exists as an escape hatch; we should not need
it.

## Steps

1. Branch `feat/typescript-6`.
2. Add `"types": ["node"]` to `compilerOptions` first and confirm
   `npx tsc --noEmit` is still clean on 5.9 (proves nothing else relied on
   auto-included `@types`).
3. `npm install -D typescript@^6`. `npm ls` clean (typescript-eslint's
   peer allows `<6.1.0`).
4. `npx tsc --noEmit`; fix any new inference errors in code, not with
   `any`.
5. `npm run lint` (typescript-eslint parses with the new compiler),
   `npm test`, `npm run build` (Next's CLI type check must pass; watch for
   Next rewriting `tsconfig.json` and commit that if it does).
6. Check the editor: VS Code should pick up the workspace TypeScript
   version ("TypeScript: Select TypeScript Version").
7. Commit. No push.

## Open questions

None.
