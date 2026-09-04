// Single export point for the whole database schema.
// - auth-schema.ts: better-auth tables (generated via `npx @better-auth/cli generate`,
//   then hand-maintained — regeneration must be merged, not overwritten).
// - directory-schema.ts: M365 mirror, spaces, app_setting; content-schema.ts: guides.
export * from "./auth-schema";
export * from "./directory-schema";
export * from "./content-schema";
