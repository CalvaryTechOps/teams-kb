// Deployment-level branding. These are NEXT_PUBLIC_* so they are inlined at
// build time and safe to import from both server and client components.
// Runtime-editable copy (sign-in text, account label) lives in the
// app_setting table instead — see site-settings.ts.

/** Product name: <title>, breadcrumbs root, sign-in heading, wordmark. */
export const APP_TITLE =
  process.env.NEXT_PUBLIC_APP_TITLE?.trim() || "Knowledge base";

/** Credit line in the sign-in hero footer. Empty string hides it. */
export const BUILT_BY =
  process.env.NEXT_PUBLIC_BUILT_BY === undefined
    ? "Built by Calvary Tech Ops"
    : process.env.NEXT_PUBLIC_BUILT_BY.trim();

/** Optional logo image (absolute URL or /public path). Blank = text wordmark. */
export const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL?.trim() || null;
