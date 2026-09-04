import * as nextEnvModule from "@next/env";
import { defineConfig } from "drizzle-kit";

// drizzle-kit only auto-loads a plain `.env`; locally the connection strings
// live in `.env.local`. Load Next's env files the same way `next dev` does —
// real environment variables (Vercel) still take precedence.
//
// @next/env is CommonJS and loaders disagree on how to expose it: drizzle-kit
// (tsx, CJS transform) surfaces the named export, plain Node ESM only the
// default. Accept either.
type NextEnv = typeof nextEnvModule;
const nextEnv: NextEnv =
  "loadEnvConfig" in nextEnvModule
    ? nextEnvModule
    : (nextEnvModule as unknown as { default: NextEnv }).default;
nextEnv.loadEnvConfig(process.cwd());

// Migrations need a direct (session-mode) connection; the pooled URL is for
// the app. Fall back for local setups that only define DATABASE_URL.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set — copy .env.example to .env.local and fill it in.",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // pg v9 will downgrade sslmode=require to weaker libpq semantics; pin the
    // strict mode (identical to today's behavior) so the upgrade changes
    // nothing. Neon endpoints present publicly trusted certs, so verify-full
    // validates with Node's default CA store.
    url: url.replace(/\bsslmode=require\b/, "sslmode=verify-full"),
  },
});
